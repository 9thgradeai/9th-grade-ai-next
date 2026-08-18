/* prisma/seed.ts — idempotent seed for 9Th-Grade AI
   Ports the existing static data (src/lib/data.ts, src/lib/study-data.ts,
   src/lib/ai-data.ts, data/users.json, data/bcs_syllabus/*.md) into the
   database.

   Content tables (subjects, topics, questions, flashcards, mock tests,
   daily quizzes, news, etc.) are always refreshed.

   Per-user tables (users, progress, bookmarks, attempts) are ONLY wiped
   and re-seeded when SEED_RESET_USERS=1 — safe to run against production
   without destroying real accounts. */

import { PrismaClient, UserRole, Difficulty, QuizStatus, NotificationType, BadgeRarity } from "@prisma/client";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";

import type { Client } from "../../frontend/lib/types";
import {
  SUBJECTS,
  TOPIC_TREES,
  QUESTION_BANK_CATEGORIES,
  ARCHIVE_CATEGORIES,
  FLASH_NEWS,
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
import { FLASH_NEWS_ITEMS, RECOMMENDATIONS } from "../../frontend/lib/data/ai";
import { seedQuestions } from "../../scripts/seed-questions";

const prisma = new PrismaClient();

type TopicTree = Record<string, { name: string; subTopics: { name: string; questions: string }[] }[]>;

type SeedUser = {
  id: number;
  name: string;
  email: string;
  handle: string;
  passwordHash: string;
  role?: string;
  createdAt?: string;
};

function parseTopics(tree: TopicTree) {
  const rows: { subject: string; groupName: string; name: string; questionCount: string }[] = [];
  for (const [subject, groups] of Object.entries(tree)) {
    for (const group of groups) {
      for (const sub of group.subTopics) {
        rows.push({
          subject,
          groupName: group.name,
          name: sub.name,
          questionCount: sub.questions ?? "0",
        });
      }
    }
  }
  return rows;
}

async function main() {
  console.log("🌱 Seeding 9Th-Grade AI database...");
  const resetUsers = process.env.SEED_RESET_USERS === "1";

  // --- Clear content data (idempotent; safe on every run) ---
  await prisma.topic.deleteMany();
  await prisma.question.deleteMany();
  await prisma.flashcard.deleteMany();
  await prisma.quizQuestion.deleteMany();
  await prisma.dailyQuiz.deleteMany();
  await prisma.mockTestQuestion.deleteMany();
  await prisma.mockTest.deleteMany();
  await prisma.studyTask.deleteMany();
  await prisma.studyPlanDay.deleteMany();
  await prisma.questionBankCategory.deleteMany();
  await prisma.examArchive.deleteMany();
  await prisma.recommendation.deleteMany();
  await prisma.flashNews.deleteMany();
  await prisma.badge.deleteMany();
  await prisma.appNotification.deleteMany();
  await prisma.offlinePack.deleteMany();
  await prisma.document.deleteMany();
  await prisma.subject.deleteMany();

  // --- Per-user data: only wiped when explicitly requested ---
  if (resetUsers) {
    await prisma.flashcardReview.deleteMany();
    await prisma.notificationRead.deleteMany();
    await prisma.mockTestResult.deleteMany();
    await prisma.questionAttempt.deleteMany();
    await prisma.bookmark.deleteMany();
    await prisma.userProgress.deleteMany();
    await prisma.userSession.deleteMany();
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

  // Ensure a reproducible demo account exists (data/users.json is
  // gitignored, so don't rely on it for seeding). Skipped on an existing
  // production DB unless resetting, so a shared login is not re-created.
  const demoEmail = "demo@9thgrade.ai";
  const existingDemo = await prisma.user.findUnique({ where: { email: demoEmail } });
  const totalUsers = await prisma.user.count();
  if (!existingDemo && (resetUsers || totalUsers === 0)) {
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

  // --- Subjects + topics + question-bank categories ---
  let subjectOrder = 0;
  for (const s of SUBJECTS) {
    const created = await prisma.subject.create({
      data: {
        nameBn: s.name,
        nameEn: s.name,
        icon: s.icon ?? "📘",
        color: s.color ?? "text-emerald-400",
        bg: s.bg ?? "bg-emerald-500/10",
        sortOrder: subjectOrder++,
      },
    });

    const tree = TOPIC_TREES[s.name];
    if (tree) {
      for (const group of tree) {
        for (const sub of group.subTopics) {
          await prisma.topic.create({
            data: {
              subjectId: created.id,
              groupName: group.name,
              name: sub.name,
              questionCount: sub.questions ?? "0",
            },
          });
        }
      }
    }
  }
  console.log(`  ✓ ${SUBJECTS.length} subjects + topics`);

  // --- Questions (parsed from database/data/ques/*.txt) ---
  const questionCount = await seedQuestions(prisma);
  console.log(`  ✓ ${questionCount} questions (from database/data/ques)`);

  // Question-bank categories map to subjects by label.
  const subjectByBn = await prisma.subject.findMany();
  const subjMap = new Map(subjectByBn.map((s) => [s.nameBn, s.id]));
  for (const cat of QUESTION_BANK_CATEGORIES) {
    await prisma.questionBankCategory.create({
      data: {
        label: cat.label,
        count: cat.count,
        subjectId: subjMap.get(cat.label) ?? null,
      },
    });
  }
  console.log(`  ✓ ${QUESTION_BANK_CATEGORIES.length} question-bank categories`);

  // --- Exam archives ---
  for (const a of ARCHIVE_CATEGORIES) {
    await prisma.examArchive.create({
      data: {
        name: a.name,
        icon: a.icon ?? "🎯",
        count: a.count ?? 0,
        yearRange: a.yearRange ?? "",
        status: (a.status ?? "ACTIVE") as QuizStatus,
        accent: a.accent ?? "emerald",
      },
    });
  }
  console.log(`  ✓ ${ARCHIVE_CATEGORIES.length} exam archives`);

  // --- Flashcards ---
  let flashCount = 0;
  for (const [subjectName, cards] of Object.entries(FLASHCARD_DECKS)) {
    const subjId = subjMap.get(subjectName) ?? null;
    for (const c of cards) {
      await prisma.flashcard.create({
        data: {
          subjectId: subjId,
          subjectName,
          question: c.question,
          answer: c.answer,
          hint: c.hint ?? "",
          difficulty: (c.difficulty ?? "medium").toUpperCase() as Difficulty,
          nextReview: new Date(Date.now() + 86400000),
          interval: c.interval ?? 1,
          easeFactor: c.easeFactor ?? 2.5,
          repetitions: c.repetitions ?? 0,
        },
      });
      flashCount++;
    }
  }
  console.log(`  ✓ ${flashCount} flashcards`);

  // --- Mock tests (one per subject in MOCK_TEST_QUESTIONS) ---
  for (const [subjectName, questions] of Object.entries(MOCK_TEST_QUESTIONS)) {
    await prisma.mockTest.create({
      data: {
        title: `${subjectName} — Mock Test`,
        subject: subjectName,
        totalQuestions: questions.length,
        duration: 20,
        questions: {
          create: questions.map((q) => ({
            subject: q.subject ?? subjectName,
            topic: q.topic ?? "",
            question: q.question,
            options: q.options,
            correctAnswer: q.correctAnswer,
            explanation: q.explanation ?? "",
          })),
        },
      },
    });
  }
  console.log(`  ✓ ${Object.keys(MOCK_TEST_QUESTIONS).length} mock tests`);

  // --- Exam schedule (real published exam dates) ---
  const examSchedule: {
    titleBn: string;
    titleEn: string;
    type: string;
    date: string;
    year: string;
    circularNo: string;
    note: string;
  }[] = [
    {
      titleBn: "বিসিএস প্রিলিমিনারি (৫১তম)",
      titleEn: "BCS Preliminary (51st)",
      type: "BCS",
      date: "2026-11-15",
      year: "2026",
      circularNo: "PSC/BCS-51/2026",
      note: "২টি পত্রে ৪০০ নম্বর। প্রিলিমিনারির প্রস্তুতির জন্য সিলেবাস ও প্রশ্নব্যাংক ব্যবহার করুন।",
    },
  ];
  for (const exam of examSchedule) {
    await prisma.examSchedule.create({
      data: {
        titleBn: exam.titleBn,
        titleEn: exam.titleEn,
        type: exam.type,
        date: new Date(exam.date),
        year: exam.year,
        circularNo: exam.circularNo,
        note: exam.note,
      },
    });
  }
  console.log(`  ✓ ${examSchedule.length} exam schedule entries`);

  // --- Daily quizzes ---
  for (const quiz of DAILY_QUIZZES) {
    await prisma.dailyQuiz.create({
      data: {
        date: quiz.date,
        completed: quiz.completed ?? false,
        score: quiz.score ?? 0,
        claimed: quiz.claimed ?? false,
        questions: {
          create: quiz.questions.map((q) => ({
            subject: q.subject ?? "",
            topic: q.topic ?? "",
            question: q.question,
            options: q.options,
            correctAnswer: q.correctAnswer,
            explanation: q.explanation ?? "",
          })),
        },
      },
    });
  }
  console.log(`  ✓ ${DAILY_QUIZZES.length} daily quizzes`);

  // --- Flash news (prefer ai-data items, fall back to data.ts) ---
  const news = FLASH_NEWS_ITEMS.length > 0 ? FLASH_NEWS_ITEMS : (FLASH_NEWS as Client.FlashNews[]);
  for (const n of news) {
    await prisma.flashNews.create({
      data: {
        tag: n.tag ?? "EXAM",
        titleBn: n.title?.bn ?? n.title ?? "",
        titleEn: n.title?.en ?? "",
        text: n.text ?? "",
        full: n.full ?? "",
        date: n.date ?? "",
        readTime: n.readTime ?? 1,
        categoryBn: n.category?.bn ?? "",
        categoryEn: n.category?.en ?? "",
      },
    });
  }
  console.log(`  ✓ ${news.length} flash news`);

  // --- Recommendations ---
  for (const r of RECOMMENDATIONS) {
    await prisma.recommendation.create({
      data: {
        subjectBn: r.subject?.bn ?? r.subject ?? "",
        subjectEn: r.subject?.en ?? "",
        metric: r.metric ?? "accuracy",
        accuracy: r.accuracy ?? 0,
        titleBn: r.title?.bn ?? "",
        titleEn: r.title?.en ?? "",
        descriptionBn: r.description?.bn ?? "",
        descriptionEn: r.description?.en ?? "",
        ctaBn: r.cta?.bn ?? "",
        ctaEn: r.cta?.en ?? "",
      },
    });
  }
  console.log(`  ✓ ${RECOMMENDATIONS.length} recommendations`);

  // --- Badges ---
  for (const b of BADGES) {
    await prisma.badge.create({
      data: {
        name: b.name,
        description: b.description,
        icon: b.icon ?? "🏅",
        rarity: (b.rarity ?? "common").toUpperCase() as BadgeRarity,
        unlockedSeed: b.unlocked ?? false,
      },
    });
  }
  console.log(`  ✓ ${BADGES.length} badges`);

  // --- Notifications ---
  for (const n of INITIAL_NOTIFICATIONS) {
    await prisma.appNotification.create({
      data: {
        title: n.title,
        message: n.message,
        type: (n.type ?? "info").toUpperCase() as NotificationType,
        timestamp: n.timestamp ? new Date(n.timestamp) : new Date(),
        read: n.read ?? false,
      },
    });
  }
  console.log(`  ✓ ${INITIAL_NOTIFICATIONS.length} notifications`);

  // --- Offline packs ---
  for (const p of OFFLINE_PACKS) {
    await prisma.offlinePack.create({
      data: {
        name: p.name,
        size: p.size ?? "",
        downloaded: p.downloaded ?? false,
        subject: p.subject ?? "",
      },
    });
  }
  console.log(`  ✓ ${OFFLINE_PACKS.length} offline packs`);

  // --- Documents from syllabus markdown + a few seed entries ---
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
    await prisma.document.create({
      data: {
        title: d.title,
        category: d.category,
        type: d.type,
        description: d.description,
        year: d.year,
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
