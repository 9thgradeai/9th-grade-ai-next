// Tools reading verified content: mistakes, the question bank, the syllabus
// tree, exam weightage, and current affairs.

import "server-only";

import { prisma } from "~backend/db";
import type { MistakeErrorType } from "@prisma/client";
import { parseErrorType } from "~backend/services/error-classifier";
import {
  getQuestionBankCategories,
  getQuestionBankExams,
  getQuestionById,
  getQuestionsPage,
  getFlashNews,
} from "~backend/services/content";
import { getExamSelectionTree } from "~backend/services/exam";
import { clamp, posInt, str, type ToolContext, type ToolDefinition, type ToolResult } from "./types";

export const getWrongAnswers: ToolDefinition = {
  name: "get_wrong_answers",
  description:
    "The learner's most recent wrong answers (mistake book): question text, topic, mastery state, mistake count and the latest server-classified mistake type, newest first. Optional arguments: subject (Bangla or English name), errorType (one of GUESSING|CARELESS_MISTAKE|CONFUSION|CONCEPTUAL_GAP|MEMORY_FAILURE|UNKNOWN), limit (default 15, max 30).",
  inputShape: '{"subject": "বাংলা", "errorType": "CONCEPTUAL_GAP", "limit": 15}',
  validateInput(raw) {
    const args = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    return {
      subject: str(args, "subject"),
      errorType: parseErrorType(str(args, "errorType")),
      limit: posInt(args, "limit", 15) ?? 15,
    };
  },
  async execute(ctx: ToolContext, args: Record<string, unknown>): Promise<ToolResult> {
    const limit = clamp(args.limit as number, 1, 30);
    const subject = (args.subject as string) || undefined;
    const errorType = args.errorType as string | undefined;
    const rows = await prisma.userQuestionProgress.findMany({
      where: {
        userId: ctx.userId,
        isMistake: true,
        ...(subject ? { lastSubject: subject } : {}),
        ...(errorType ? { question: { attempts: { some: { errorType: errorType as MistakeErrorType } } } } : {}),
      },
      orderBy: { lastIncorrectAt: "desc" },
      take: limit,
      select: {
        questionId: true,
        lastSubject: true,
        lastTopic: true,
        mistakeCount: true,
        masteryStatus: true,
        lastIncorrectAt: true,
        question: {
          select: {
            question: true,
            correctAnswer: true,
            attempts: { orderBy: { createdAt: "desc" }, take: 1, select: { errorType: true } },
          },
        },
      },
    });
    const total = await prisma.userQuestionProgress.count({
      where: { userId: ctx.userId, isMistake: true },
    });
    if (rows.length === 0) {
      return { summary: "No current mistakes in the notebook.", data: { items: [], total } };
    }
    return {
      summary: `${rows.length} current mistakes (${total} total in notebook): ` + rows
        .map((r) => `Q${r.questionId} ${r.lastTopic || r.lastSubject} — ${r.mistakeCount}x wrong`)
        .join("; "),
      data: {
        total,
        items: rows.map((r) => ({
          questionId: r.questionId,
          subject: r.lastSubject,
          topic: r.lastTopic,
          wrongCount: r.mistakeCount,
          status: r.masteryStatus,
          lastIncorrectAt: r.lastIncorrectAt,
          latestErrorType: r.question?.attempts?.[0]?.errorType ?? null,
          text: r.question?.question ?? "",
        })),
      },
    };
  },
};

export const searchQuestions: ToolDefinition = {
  name: "search_questions",
  description:
    "Full-text search over the verified question bank. Returns question text, subject, topic, difficulty, and answer. Arguments: q (search text, required), subject (optional), topic (optional), limit (default 8, max 20).",
  inputShape: '{"q": "বাংলার ইতিহাস", "subject": "বাংলা", "topic": "সম্রাট", "limit": 8}',
  validateInput(raw) {
    const args = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    const q = str(args, "q");
    if (!q) throw new Error("search_questions requires a non-empty 'q'.");
    return { q, subject: str(args, "subject"), topic: str(args, "topic"), limit: posInt(args, "limit", 8) ?? 8 };
  },
  async execute(ctx: ToolContext, args: Record<string, unknown>): Promise<ToolResult> {
    const limit = clamp(args.limit as number, 1, 20);
    const { questions, total } = await getQuestionsPage({
      q: args.q as string,
      subject: (args.subject as string) || undefined,
      topic: (args.topic as string) || undefined,
      page: 1,
      limit,
    });
    if (questions.length === 0) return { summary: "No matching questions found.", data: { items: [], total } };
    return {
      summary: `${total} matching questions. First results: ` + questions
        .map((q) => `Q${q.id} [${q.difficulty}] ${q.topic}`)
        .join("; "),
      data: {
        total,
        items: questions.map((q) => ({
          id: q.id,
          subject: q.subject,
          topic: q.topic,
          difficulty: q.difficulty,
          text: q.question,
          options: q.options,
          correctAnswer: q.correctAnswer,
          explanation: q.explanation,
        })),
      },
    };
  },
};

export const getQuestion: ToolDefinition = {
  name: "get_question",
  description:
    "A single question by id with its options, correct answer and explanation. Argument: id (number, required).",
  inputShape: '{"id": 2231}',
  validateInput(raw) {
    const args = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    const id = posInt(args, "id");
    if (!id) throw new Error("get_question requires a positive numeric 'id'.");
    return { id };
  },
  async execute(ctx: ToolContext, args: Record<string, unknown>): Promise<ToolResult> {
    const q = await getQuestionById(args.id as number);
    if (!q) return { ok: false, summary: "Question not found." };
    return {
      summary: `Q${q.id} [${q.subject}/${q.topic}/${q.difficulty}] ${q.question.slice(0, 160)} ${q.options.map((o, i) => `${i}) ${o}`).join(" | ")}`,
      data: {
        id: q.id,
        subject: q.subject,
        topic: q.topic,
        subtopic: q.subtopic,
        difficulty: q.difficulty,
        text: q.question,
        options: q.options,
        correctAnswer: q.correctAnswer,
        explanation: q.explanation,
        year: q.year,
        sourceExam: q.sourceExam,
      },
    };
  },
};

export const searchSyllabus: ToolDefinition = {
  name: "search_syllabus",
  description:
    "The full subject/topic syllabus tree with live question counts, plus the exam library (BCS → papers). No arguments.",
  inputShape: "{}",
  validateInput(raw) {
    return raw && typeof raw === "object" ? {} : {};
  },
  async execute(ctx: ToolContext): Promise<ToolResult> {
    const [categories, exams] = await Promise.all([
      getQuestionBankCategories(),
      getQuestionBankExams(),
    ]);
    return {
      summary:
        `Subjects: ${categories.map((c) => `${c.label} (${c.count})`).join(", ")}. ` +
        `Exam categories: ${exams.map((e) => e.nameBn).join(", ")}.`,
      data: { subjects: categories, exams },
    };
  },
};

export const getTopic: ToolDefinition = {
  name: "get_topic",
  description:
    "Detail for a single topic by name (or id): subject, path, and verified question count. Argument: q (topic name, string) or id (number).",
  inputShape: '{"q": "মুক্তিযুদ্ধ", "id": 12}',
  validateInput(raw) {
    const args = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    return { q: str(args, "q"), id: posInt(args, "id") ?? 0 };
  },
  async execute(ctx: ToolContext, args: Record<string, unknown>): Promise<ToolResult> {
    const topic = args.id
      ? await prisma.topic.findUnique({
          where: { id: args.id as number },
          include: { subject: { select: { nameBn: true } } },
        })
      : await prisma.topic.findFirst({
          where: { name: { contains: (args.q as string) || "" } },
          include: { subject: { select: { nameBn: true } } },
        });
    if (!topic) return { ok: false, summary: "Topic not found." };
    const count = await prisma.question.count({ where: { topic: topic.name } });
    return {
      summary: `${topic.name} (${topic.subject?.nameBn ?? "unknown subject"}): ${count} verified questions. Path: ${topic.path || "—"}`,
      data: { id: topic.id, name: topic.name, path: topic.path, subject: topic.subject?.nameBn ?? "", questionCount: count },
    };
  },
};

export const getExamWeightage: ToolDefinition = {
  name: "get_exam_weightage",
  description:
    "Exam weightage breakdown: available exams with per-subject question counts. Argument: exam (optional exam title, else returns the first exam's breakdown).",
  inputShape: '{"exam": "BCS Preliminary"}',
  validateInput(raw) {
    const args = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    return { exam: str(args, "exam") };
  },
  async execute(ctx: ToolContext, args: Record<string, unknown>): Promise<ToolResult> {
    const tree = await getExamSelectionTree();
    if (tree.length === 0) return { ok: false, summary: "No exam data available." };
    const desired = (args.exam as string) || "";
    const ex =
      tree.find((e) => e.nameBn === desired || e.nameEn === desired || e.nameEn?.toLowerCase() === desired.toLowerCase()) ??
      tree[0];
    const nodes = ex.nodes.map((n) => ({
      id: n.id,
      name: n.name,
      depth: n.depth,
      questionCount: n.questionCount ?? 0,
    }));
    return {
      summary: `${ex.nameBn}: ${nodes.map((s) => `${s.name} (${s.questionCount})`).join(", ")}`,
      data: { examId: ex.id, exam: ex.nameBn, subjects: nodes, totalQuestions: ex.questionCount },
    };
  },
};

export const searchCurrentAffairs: ToolDefinition = {
  name: "search_current_affairs",
  description:
    "Recent VERIFIED current-affairs news items (only from the platform's fact-checked feed; sourceUrl included). Arguments: q (optional search text), category (optional: জাতীয়, আন্তর্জাতিক, অর্থনীতি, বিজ্ঞান ও প্রযুক্তি, খেলাধুলা, বিসিএস), limit (default 6, max 15).",
  inputShape: '{"q": "মহাকাশ", "category": "জাতীয়", "limit": 6}',
  validateInput(raw) {
    const args = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    return { q: str(args, "q"), category: str(args, "category"), limit: posInt(args, "limit", 6) ?? 6 };
  },
  async execute(ctx: ToolContext, args: Record<string, unknown>): Promise<ToolResult> {
    const limit = clamp(args.limit as number, 1, 15);
    const category = (args.category as string) || undefined;
    const q = ((args.q as string) || "").toLowerCase();
    const items = await getFlashNews();
    const filtered = items.filter((n) => {
      const categoryMatch = category ? n.categoryBn === category || n.categoryEn === category : true;
      const textMatch = q
        ? [n.titleBn, n.titleEn, n.text]
            .filter(Boolean)
            .some((t) => (t || "").toLowerCase().includes(q))
        : true;
      return categoryMatch && textMatch;
    });
    if (filtered.length === 0) return { summary: "No current-affairs items found.", data: { items: [] } };
    return {
      summary: filtered
        .slice(0, limit)
        .map((n) => `[${n.categoryBn}] ${n.titleBn}`)
        .join("; "),
      data: {
        verified: true,
        items: filtered.slice(0, limit).map((n) => ({
          id: n.id,
          titleBn: n.titleBn,
          categoryBn: n.categoryBn,
          date: n.date,
          sourceUrl: n.sourceUrl ?? null,
          verified: true,
        })),
      },
    };
  },
};