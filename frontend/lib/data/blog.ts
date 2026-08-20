export type BlogPost = {
  slug: string;
  tag: string;
  title: string;
  excerpt: string;
  date: string;
  readTime: string;
  body: string[];
};

export const BLOG_POSTS: BlogPost[] = [
  {
    slug: "bcs-preliminary-first-attempt",
    tag: "STRATEGY",
    title: "How to Clear BCS Preliminary in Your First Attempt",
    excerpt:
      "A month-by-month breakdown of the BCS prelim syllabus, with the exact subject weightage, daily hour plan, and the mistake most first-timers make.",
    date: "Aug 18, 2026",
    readTime: "8 min",
    body: [
      "BCS Preliminary is a 200-mark, 100-question paper with two hours on the clock. The syllabus is vast, but the pattern is extremely predictable — which means a disciplined plan beats raw intelligence every time.",
      "Split your preparation into three phases. Phase one (months 1–2) is syllabus completion: cover all 10 subjects in the BCS syllabus explorer at a steady pace, keeping notes that are revision-ready from day one. Phase two (months 3–4) is practice-heavy: work through the tagged question bank subject by subject and let the analytics highlight your weak topics. Phase three (the final month) is all mock tests — one full-length prelim daily, reviewed with a three-pass system.",
      "The single biggest mistake first-timers make is skipping daily revision. Spaced-repetition flashcards, even 30 minutes a day, convert short-term recall into exam-day confidence.",
      "Track your accuracy per subject weekly. If a subject sits below 70%, it is your bottleneck — pour a few extra hours into it before it compounds.",
    ],
  },
  {
    slug: "mental-math-bank-exams",
    tag: "MATH",
    title: "Mental Math Speed Drills for Bank Recruitment Exams",
    excerpt:
      "Bank exams reward speed. Learn the 12 highest-yield calculation shortcuts plus a daily drill routine to push your solve rate past 90%.",
    date: "Aug 12, 2026",
    readTime: "6 min",
    body: [
      "Bank exams are won in the first 20 seconds of every math problem. The difference between a comfortable paper and a time-crisis is not harder math — it is faster arithmetic.",
      "Master the twelve highest-yield shortcuts: percentage reciprocals, compound interest approximations, profit & loss fractions, ratio shortcuts, squares & cubes, square roots, time-work ladders, train & distance identities, boat-stream formulas, installment logic, data interpretation subtraction, and approximation rules.",
      "Drill daily with a 10-question speed set and a hard 45-second timer per question. Track your solve rate the same way you track accuracy — speed is a measurable skill, not a talent.",
    ],
  },
  {
    slug: "spaced-repetition-notes",
    tag: "SRS",
    title: "Why Spaced Repetition Beats Rote Memorization",
    excerpt:
      "The science behind spaced repetition, and how to use flashcards for Bangladesh Affairs and Ethics without burning out.",
    date: "Aug 05, 2026",
    readTime: "7 min",
    body: [
      "Forgetting is a feature, not a bug — it is the signal that tells your brain what to strengthen. Spaced repetition schedules reviews right before you are about to forget, turning fragile recall into durable memory with the least total effort.",
      "For Bangladesh Affairs and Ethics — the two most memory-heavy subjects in any govt exam — automated flashcards are the difference between cramming and actually knowing.",
      "The habit: review 30–50 flashcards daily, let the algorithm decide what resurfaces, and never skip a day. Consistency of the schedule matters far more than the length of any single session.",
    ],
  },
  {
    slug: "current-affairs-habit",
    tag: "CURRENT AFFAIRS",
    title: "Daily Current Affairs: A 20-Minute Habit That Compounds",
    excerpt:
      "A practical framework for consuming, noting, and revising current affairs daily — the single highest-ROI habit for any govt exam.",
    date: "Jul 28, 2026",
    readTime: "5 min",
    body: [
      "Current affairs is the only section where every candidate starts at zero — and the only one where a daily 20-minute habit reliably guarantees marks.",
      "The framework is three boxes: Consume (10 minutes) — skim the daily flash-news feed and note only facts, not opinions. Note (5 minutes) — write one-line answers for the five Ws of each item. Revise (5 minutes) — answer yesterday's notes from memory before reading today's.",
      "Twenty minutes a day beats three hours on a Sunday, every single time. The habit compounds into a month-by-month archive you can fully revise in the final week.",
    ],
  },
  {
    slug: "read-your-analytics",
    tag: "ANALYTICS",
    title: "Reading Your Performance Analytics Like a Pro",
    excerpt:
      "Accuracy trends, time-per-question, and topic mastery — what each chart means and how to turn insights into a concrete weekly plan.",
    date: "Jul 20, 2026",
    readTime: "6 min",
    body: [
      "Data without decisions is just decoration. Your progress analytics surface four signals: accuracy trends, time per question, topic mastery, and streak consistency.",
      "Accuracy trend down? You are attempting material slightly above your current level — drop a difficulty notch until the trend stabilizes. Time per question creeping up? Run timed speed drills on the two slowest subjects. A topic stuck below mastery? That is your next study session, no debate.",
      "Once a week, convert the charts into one written plan: one subject to attack, one habit to protect, one metric to beat. That is the whole game.",
    ],
  },
  {
    slug: "mock-test-review",
    tag: "MOCK TESTS",
    title: "The Right Way to Review a Mock Test",
    excerpt:
      "Most aspirants waste mock tests. A three-pass review system — wrong answers, lucky guesses, and slow solves — that maximizes every attempt.",
    date: "Jul 14, 2026",
    readTime: "7 min",
    body: [
      "A mock test is not a score — it is a diagnostic. The score you see is the least valuable output; the review is where you actually get better.",
      "Pass one: every wrong answer. Ask why — a knowledge gap, a misread, or a careless slip — and tag it. Pass two: every lucky guess you got right. These are disguised gaps and will become wrong answers in a harder paper. Pass three: every question you solved slowly. Note the topic and add it to your speed-drill list.",
      "Three passes, one hour, one written action list. Do that after every mock and your next score will move — guaranteed.",
    ],
  },
];