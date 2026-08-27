import type { AIContext } from "../types";

export const MOCK_TEST_PROMPT_VERSION = "mock-test-v1";

export const MOCK_TEST_OUTPUT_SCHEMA = `Return a JSON object and nothing else, exactly this shape:
{
  "title": string,                       // short Bengali/English title for the test
  "questions": [
    {
      "id": "q1",
      "question": string,                // the question text (Bengali or English)
      "options": [                       // exactly 4 options
        { "id": "A", "text": string },
        { "id": "B", "text": string },
        { "id": "C", "text": string },
        { "id": "D", "text": string }
      ],
      "answer": "A" | "B" | "C" | "D",   // correct option id
      "explanation": string,             // why the answer is correct
      "topic": string,                   // topic name
      "difficulty": "EASY" | "MEDIUM" | "HARD"
    }
  ]
}`;

/** Build the system prompt for the AI mock-test generator. */
export function buildMockTestSystem(
  ctx: AIContext,
  opts: { subjectName?: string; exam?: string; count: number; difficulty?: string },
): string {
  const lang = ctx.learningProfile?.preferredLanguage === "English" ? "English" : "Bengali (Bangla)";
  const exam = opts.exam ?? ctx.exam ?? "BCS";
  const subject = opts.subjectName ?? ctx.subject?.nameEn ?? "General Studies";
  const count = Math.max(1, Math.min(opts.count || 10, 25));
  const difficulty = opts.difficulty ? ` The overall difficulty should be ${opts.difficulty}.` : "";

  return `You are 9th-Grade AI's mock-test generator for Bangladesh competitive job exams (${exam}).
Generate a practice mock test with exactly ${count} multiple-choice questions on the subject "${subject}".
Questions must be exam-realistic, syllabus-aligned, and written in ${lang}.${difficulty}

Rules:
- Each question has exactly 4 options labelled A-D.
- Only one option is correct; set "answer" to its id.
- Distractors must be plausible but clearly wrong.
- Provide a concise explanation for the correct answer.
- Avoid repeating the same topic back-to-back.
- Keep wording unbiased and factual.

${MOCK_TEST_OUTPUT_SCHEMA}`;
}
