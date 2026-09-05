"use client";

// Curated start-of-conversation prompts for the AI workspace. Tutor prompts are
// seeded from the app's `PRESET_PROMPTS`; assistant/coach quick acts are real,
// honest follow-ups to the learner's own performance data — nothing here fakes
// a capability the backend doesn't have.

import type { Mode } from "./modes";

export type QuickPrompt = {
  labelBn: string;
  prompt: string;
  category: Exclude<Mode, "tutor">;
};

export const QUICK_PROMPTS: QuickPrompt[] = [
  {
    labelBn: "আজ কী পড়ব?",
    prompt: "আজ কী পড়ব? আমার অগ্রগতি ও দুর্বল বিষয় দেখে পরামর্শ দাও।",
    category: "assistant",
  },
  {
    labelBn: "দুর্বল বিষয়গুলো",
    prompt: "আমার দুর্বল বিষয়গুলো কী কী? সেগুলো শুরুর জন্য কী করব?",
    category: "assistant",
  },
  {
    labelBn: "প্র্যাক্টিস শুরু করো",
    prompt: "আমাকে একটি প্র্যাক্টিস সেশন পরামর্শ দাও।",
    category: "assistant",
  },
  {
    labelBn: "কারেন্ট অ্যাফেয়ার্স",
    prompt: "সাম্প্রতিক কারেন্ট অ্যাফেয়ার্স কী কী?",
    category: "assistant",
  },
  {
    labelBn: "গত সেশনের বিশ্লেষণ",
    prompt: "আমার সাম্প্রতিক সেশনগুলো বিশ্লেষণ করো এবং তার পরের পরামর্শ দাও।",
    category: "assistant",
  },
  {
    labelBn: "পরের ধাপ কী?",
    prompt: "আমার পড়াশোনার পরবর্তী ধাপ কী হওয়া উচিত? অগ্রগতি ও দুর্বল বিষয় দেখে পরামর্শ দাও।",
    category: "agent",
  },
  {
    labelBn: "দুর্বল বিষয় + প্র্যাক্টিস",
    prompt: "আমার দুর্বল বিষয়গুলো চিহ্নিত করো এবং সেগুলোর জন্য প্র্যাক্টিস শুরু করার পরামর্শ দাও।",
    category: "agent",
  },
  {
    labelBn: "আজকের প্ল্যান",
    prompt: "আজকের দিনের জন্য একটি স্ট্রাকচার্ড স্টাডি প্ল্যান তৈরি করে দাও।",
    category: "agent",
  },
  {
    labelBn: "মক পরীক্ষা প্রস্তুতি",
    prompt: "মক পরীক্ষার জন্য আমার প্রস্তুতি কেমন এবং কী করা দরকার?",
    category: "agent",
  },
];