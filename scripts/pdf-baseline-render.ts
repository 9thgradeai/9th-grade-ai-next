import { renderExamPdf } from "~backend/services/pdf";
import { writeFileSync } from "fs";

async function main() {
  const doc = {
    examId: "test-1",
    title: "বাংলাদেশের রাজধানী কোনটি? x² + y² = z²",
    subject: "বাংলা ভাষা ও সাহিত্য",
    durationMinutes: 30,
    totalQuestions: 2,
    generatedAt: new Date().toISOString(),
    instructions: ["১. সঠিক উত্তরটি নির্বাচন করুন।"],
    questions: [
      {
        number: 1,
        text: "বাংলাদেশ ১৯৭১ সালে স্বাধীনতা লাভ করে। ব্যবস্থাপনা ও পরিভ্রমণ — বন্যা ও নদীভাঙন দুর্যোগের কারণ? √2 এবং π এর মান কত? x² + y² = z² হলে x = 3 এবং y = 4. প্রাণী, মাকড়সা, দুর্যোগ, ভূমিকম্প, পরিবেশ।",
        options: [
          { key: "A", text: "১৯৭১" },
          { key: "B", text: "বাংলাদেশ ব্যাংক (Bangladesh Bank) — Central Bank" },
          { key: "C", text: "x² = 100 হলে x = ±10" },
          { key: "D", text: "Red Data Book, Great Barrier Reef — ≤ ≥ ≠ ∞ ° %" },
        ],
        correctAnswer: "১৯৭১",
        explanation:
          "ব্যাখ্যা: এটি একটি দীর্ঘ ব্যাখ্যা — বন্যা ও নদীভাঙন, ভূমিকম্প, দুর্যোগ ব্যবস্থাপনা, পরিবেশ ও জীবনযাপন। π = 3.14159, √2 = 1.41421।",
        subject: "বাংলা",
        topic: "সাধারণ জ্ঞান",
        difficulty: "MEDIUM",
      },
      {
        number: 2,
        text: "How many planets in the solar system? সূর্যের নিকটতম গ্রহ কোনটি?",
        options: [
          { key: "A", text: "8" },
          { key: "B", text: "9" },
          { key: "C", text: "ভূগোল Geography" },
          { key: "D", text: "-0.5 +1 0 60 100 2100" },
        ],
        correctAnswer: "8",
        explanation: "Mercury is closest. বুধ সূর্যের নিকটতম।",
        subject: "English",
        topic: "General Knowledge",
        difficulty: "EASY",
      },
    ],
  };
  const result = await renderExamPdf(doc as never, {
    includeAnswers: true,
    includeExplanations: true,
    shuffleQuestions: false,
  });
  writeFileSync("/tmp/current-render.pdf", result.buffer);
  console.log(
    "wrote",
    result.byteSize,
    "bytes, questions:",
    result.questionCount,
    "skipped:",
    result.skippedCount,
  );
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});