/* prisma/seed.ts — idempotent, NON-DESTRUCTIVE seed for 9Th-Grade AI
   Ports the existing static data (src/lib/data.ts, src/lib/study-data.ts,
   src/lib/ai-data.ts, data/users.json, data/bcs_syllabus/*.md) into the
   database.

   Safe to run on every deploy: every content row carries a natural key or a
   deterministic `sourceKey`, so seeding UPSERTS instead of wiping. Row ids
   are stable across runs, which keeps user data intact:
     - Bookmarks reference Question ids
     - QuestionAttempts reference Question ids (SetNull otherwise)
     - NotificationRead / DailyQuizParticipation / FlashcardReview reference
       their announcement/quiz/card rows

   The ONLY destructive path is explicit opt-in:
     - SEED_RESET_USERS=1 wipes and re-seeds per-user tables.
   ---------------------------------------------------------------------------- */

import { PrismaClient, UserRole, Difficulty, QuizStatus, NotificationType, BadgeRarity } from "@prisma/client";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";

import type { Client } from "../../frontend/lib/types";
import {
  QUESTION_BANK_CATEGORIES,
  ARCHIVE_CATEGORIES,
} from "../../frontend/lib/data";
import {
  FLASHCARD_DECKS,
  MOCK_TEST_QUESTIONS,
  DAILY_QUIZZES,
  BADGES,
  INITIAL_NOTIFICATIONS,
  OFFLINE_PACKS,
  SOLVER_EXAMPLES,
} from "../../frontend/lib/data/study";
import { seedQuestions } from "../../scripts/seed-questions";
import { sourceKey } from "../../scripts/seed-keys";

const prisma = new PrismaClient();

type SeedUser = {
  id: number;
  name: string;
  email: string;
  handle: string;
  passwordHash: string;
  role?: string;
  createdAt?: string;
};

async function main() {
  console.log("🌱 Seeding 9Th-Grade AI database (non-destructive upsert mode)...");
  const resetUsers = process.env.SEED_RESET_USERS === "1";

  // --- Per-user data: only wiped when explicitly requested ---
  if (resetUsers) {
    await prisma.flashcardReview.deleteMany();
    await prisma.notificationRead.deleteMany();
    await prisma.mockTestResult.deleteMany();
    await prisma.questionAttempt.deleteMany();
    await prisma.bookmark.deleteMany();
    await prisma.userProgress.deleteMany();
    await prisma.user.deleteMany();
  }

  // --- Users (from data/users.json, when resetting) ---
  if (resetUsers) {
    let users: SeedUser[] = [];
    try {
      const raw = readFileSync(join(process.cwd(), "database", "data", "users.json"), "utf-8");
      users = JSON.parse(raw);
    } catch {
      users = [];
    }
    for (const u of users) {
      await prisma.user.upsert({
        where: { email: u.email },
        update: {},
        create: {
          id: String(u.id),
          name: u.name,
          email: u.email,
          handle: u.handle,
          passwordHash: u.passwordHash,
          role: (u.role ?? "student").toUpperCase() as UserRole,
          createdAt: u.createdAt ? new Date(u.createdAt) : undefined,
        },
      });
    }
    console.log(`  ✓ ${users.length} users`);
  }

  // Ensure a reproducible demo account exists for local development. Never
  // created in production builds (NODE_ENV=production) — a publicly-known
  // login must not exist on a live database. Force locally via
  // SEED_RESET_USERS=1.
  const demoEmail = "demo@9thgrade.ai";
  const existingDemo = await prisma.user.findUnique({ where: { email: demoEmail } });
  const totalUsers = await prisma.user.count();
  const isProdBuild = process.env.NODE_ENV === "production";
  if (!existingDemo && !isProdBuild && (resetUsers || totalUsers === 0)) {
    const { hash } = await import("bcryptjs");
    const passwordHash = await hash("demo12345", 10);
    await prisma.user.create({
      data: {
        name: "Demo Aspirant",
        email: demoEmail,
        handle: "demo",
        passwordHash,
        role: "STUDENT" as UserRole,
      },
    });
    console.log("  ✓ demo account created (demo@9thgrade.ai / demo12345)");
  }

  // --- Subjects + recursive topics + questions (content taxonomy) ---
  // seedQuestions owns the content taxonomy: it creates the 10 subjects, builds
  // the recursive Topic tree from database/data/taxonomy.json and inserts all
  // questions from database/data/ques.
  const questionCount = await seedQuestions(prisma);
  console.log(`  ✓ ${questionCount} questions (from database/data/ques)`);

  // Question-bank categories map to subjects by label (upsert by unique label).
  const subjectByBn = await prisma.subject.findMany();
  const subjMap = new Map(subjectByBn.map((s) => [s.nameBn, s.id]));
  for (const cat of QUESTION_BANK_CATEGORIES) {
    await prisma.questionBankCategory.upsert({
      where: { label: cat.label },
      update: { count: cat.count, subjectId: subjMap.get(cat.label) ?? null },
      create: {
        label: cat.label,
        count: cat.count,
        subjectId: subjMap.get(cat.label) ?? null,
      },
    });
  }
  console.log(`  ✓ ${QUESTION_BANK_CATEGORIES.length} question-bank categories`);

  // --- Exam archives (upsert by unique name) ---
  for (const a of ARCHIVE_CATEGORIES) {
    const data = {
      icon: a.icon ?? "🎯",
      count: a.count ?? 0,
      yearRange: a.yearRange ?? "",
      status: (a.status ?? "ACTIVE") as QuizStatus,
      accent: a.accent ?? "emerald",
    };
    await prisma.examArchive.upsert({
      where: { name: a.name },
      update: data,
      create: { name: a.name, ...data },
    });
  }
  console.log(`  ✓ ${ARCHIVE_CATEGORIES.length} exam archives`);

  // --- Flashcards (upsert by md5(subjectName|question) sourceKey) ---
  let flashCount = 0;
  for (const [subjectName, cards] of Object.entries(FLASHCARD_DECKS)) {
    const subjId = subjMap.get(subjectName) ?? null;
    for (const c of cards) {
      const data = {
        subjectId: subjId,
        subjectName,
        answer: c.answer,
        hint: c.hint ?? "",
        difficulty: (c.difficulty ?? "medium").toUpperCase() as Difficulty,
        nextReview: new Date(Date.now() + 86400000),
        interval: c.interval ?? 1,
        easeFactor: c.easeFactor ?? 2.5,
        repetitions: c.repetitions ?? 0,
      };
      await prisma.flashcard.upsert({
        where: { sourceKey: sourceKey(subjectName, c.question) },
        update: data,
        create: { question: c.question, sourceKey: sourceKey(subjectName, c.question), ...data },
      });
      flashCount++;
    }
  }
  console.log(`  ✓ ${flashCount} flashcards`);

  // --- Mock tests (upsert by unique title; questions refreshed in place —
  //     no user rows reference MockTestQuestion) ---
  for (const [subjectName, questions] of Object.entries(MOCK_TEST_QUESTIONS)) {
    const title = `${subjectName} — Mock Test`;
    const mock = await prisma.mockTest.upsert({
      where: { title },
      update: { totalQuestions: questions.length, duration: 20 },
      create: {
        title,
        subject: subjectName,
        totalQuestions: questions.length,
        duration: 20,
      },
    });
    // Atomic replace: readers never observe a half-emptied question set.
    await prisma.$transaction([
      prisma.mockTestQuestion.deleteMany({ where: { mockTestId: mock.id } }),
      prisma.mockTestQuestion.createMany({
        data: questions.map((q) => ({
          mockTestId: mock.id,
          subject: q.subject ?? subjectName,
          topic: q.topic ?? "",
          question: q.question,
          options: q.options,
          correctAnswer: q.correctAnswer,
          explanation: q.explanation ?? "",
        })),
      }),
    ]);
  }
  console.log(`  ✓ ${Object.keys(MOCK_TEST_QUESTIONS).length} mock tests`);

  // --- Exam schedule (verified official dates only) ---
  // No placeholder/fabricated dates are seeded. Real exam dates must come from
  // verified official circulars (BPSC etc.); until then the dashboard shows an
  // empty state instead of inventing a schedule.
  await prisma.examSchedule.deleteMany({});
  const examSchedule: {
    titleBn: string;
    titleEn: string;
    type: string;
    date: string;
    year: string;
    circularNo: string;
    note: string;
    sourceUrl: string;
    verified: boolean;
  }[] = [];
  for (const exam of examSchedule) {
    await prisma.examSchedule.upsert({
      where: { sourceKey: sourceKey(exam.circularNo, exam.titleBn, exam.year) },
      update: {
        titleEn: exam.titleEn,
        type: exam.type,
        date: new Date(exam.date),
        year: exam.year,
        note: exam.note,
        sourceUrl: exam.sourceUrl || null,
        verified: exam.verified,
      },
      create: {
        titleBn: exam.titleBn,
        titleEn: exam.titleEn,
        type: exam.type,
        date: new Date(exam.date),
        year: exam.year,
        circularNo: exam.circularNo,
        note: exam.note,
        sourceUrl: exam.sourceUrl || null,
        verified: exam.verified,
        sourceKey: sourceKey(exam.circularNo, exam.titleBn, exam.year),
      },
    });
  }
  console.log(`  ✓ ${examSchedule.length} exam schedule entries`);

  // --- Daily quizzes (upsert by unique date; question children refreshed —
  //     participations reference the quiz row, not its questions) ---
  for (const quiz of DAILY_QUIZZES) {
    const dq = await prisma.dailyQuiz.upsert({
      where: { date: quiz.date },
      update: {},
      create: {
        date: quiz.date,
        completed: quiz.completed ?? false,
        score: quiz.score ?? 0,
        claimed: quiz.claimed ?? false,
      },
    });
    // Atomic replace: readers never observe a half-emptied question set.
    await prisma.$transaction([
      prisma.quizQuestion.deleteMany({ where: { dailyQuizId: dq.id } }),
      prisma.quizQuestion.createMany({
        data: quiz.questions.map((q) => ({
          dailyQuizId: dq.id,
          subject: q.subject ?? "",
          topic: q.topic ?? "",
          question: q.question,
          options: q.options,
          correctAnswer: q.correctAnswer,
          explanation: q.explanation ?? "",
        })),
      }),
    ]);
  }
  console.log(`  ✓ ${DAILY_QUIZZES.length} daily quizzes`);

  // --- Flash news (editorially curated from verified official sources) ---
  // Clear any previously seeded placeholder items so none persist, and seed
  // nothing fabricated. The dashboard hides the section when empty.
  await prisma.flashNews.deleteMany({});
  const news: Client.FlashNews[] = [];
  for (const n of news) {
    const titleBn = n.title?.bn ?? n.title ?? "";
    const data = {
      tag: n.tag ?? "EXAM",
      titleEn: n.title?.en ?? "",
      text: n.text ?? "",
      full: n.full ?? "",
      date: n.date ?? "",
      readTime: n.readTime ?? 1,
      categoryBn: n.category?.bn ?? "",
      categoryEn: n.category?.en ?? "",
      sourceUrl: n.sourceUrl ?? null,
      verified: n.verified ?? false,
    };
    await prisma.flashNews.upsert({
      where: { sourceKey: sourceKey(titleBn, data.date) },
      update: data,
      create: { titleBn, sourceKey: sourceKey(titleBn, data.date), ...data },
    });
  }
  console.log(`  ✓ ${news.length} flash news`);

  // --- Badges (upsert by unique name) ---
  for (const b of BADGES) {
    const data = {
      description: b.description,
      icon: b.icon ?? "🏅",
      rarity: (b.rarity ?? "common").toUpperCase() as BadgeRarity,
      unlockedSeed: b.unlocked ?? false,
    };
    await prisma.badge.upsert({
      where: { name: b.name },
      update: { description: data.description, icon: data.icon, rarity: data.rarity },
      create: { name: b.name, ...data },
    });
  }
  console.log(`  ✓ ${BADGES.length} badges`);

  // --- Notifications (upsert by md5(title|message); NotificationRead rows
  //     reference these ids and must survive reseeds) ---
  for (const n of INITIAL_NOTIFICATIONS) {
    const data = {
      type: (n.type ?? "info").toUpperCase() as NotificationType,
      timestamp: n.timestamp ? new Date(n.timestamp) : new Date(),
      read: n.read ?? false,
    };
    await prisma.appNotification.upsert({
      where: { sourceKey: sourceKey(n.title, n.message) },
      update: { type: data.type },
      create: {
        title: n.title,
        message: n.message,
        sourceKey: sourceKey(n.title, n.message),
        ...data,
      },
    });
  }
  console.log(`  ✓ ${INITIAL_NOTIFICATIONS.length} notifications`);

  // --- Offline packs (upsert by unique name) ---
  for (const p of OFFLINE_PACKS) {
    const data = {
      size: p.size ?? "",
      downloaded: p.downloaded ?? false,
      subject: p.subject ?? "",
    };
    await prisma.offlinePack.upsert({
      where: { name: p.name },
      update: data,
      create: { name: p.name, ...data },
    });
  }
  console.log(`  ✓ ${OFFLINE_PACKS.length} offline packs`);

  // --- Documents from syllabus markdown + a few seed entries
  //     (upsert by md5(title|category|year)) ---
  const docs: { title: string; category: string; type: string; description: string; year: string }[] = [
    { title: "BCS Preliminary Syllabus (Full)", category: "Syllabus", type: "md", description: "Complete BCS Preliminary syllabus coverage across all 10 subjects.", year: "2026" },
  ];
  try {
    const syllabusDir = join(process.cwd(), "database", "data", "bcs_syllabus");
    const files = readdirSync(syllabusDir).filter((f: string) => /\.(md|pdf)$/i.test(f));
    for (const f of files) {
      docs.push({
        title: f.replace(/\.[^.]+$/, "").replace(/[-_]/g, " "),
        category: "Syllabus",
        type: f.endsWith(".pdf") ? "pdf" : "md",
        description: "Imported syllabus / circular document.",
        year: "2026",
      });
    }
  } catch {
    /* no syllabus dir */
  }
  for (const d of docs) {
    const data = {
      type: d.type,
      description: d.description,
    };
    await prisma.document.upsert({
      where: { sourceKey: sourceKey(d.title, d.category, d.year) },
      update: data,
      create: {
        title: d.title,
        category: d.category,
        year: d.year,
        sourceKey: sourceKey(d.title, d.category, d.year),
        ...data,
      },
    });
  }
  console.log(`  ✓ ${docs.length} documents`);

  console.log("✅ Seed complete.");
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
