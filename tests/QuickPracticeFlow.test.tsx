import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import SessionTimer from "@/components/dashboard/practice/SessionTimer";
import {
  queuePracticeSubmit,
  loadQueuedPracticeSubmit,
  clearQueuedPracticeSubmit,
  isNetworkFailure,
} from "@/lib/practice-submit-queue";

function stubFetch(routes: Record<string, unknown>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      const match = Object.keys(routes).find((r) => url.startsWith(r));
      if (!match) {
        return { ok: false, status: 404, statusText: "Not Found", json: async () => ({}) } as Response;
      }
      return { ok: true, status: 200, json: async () => routes[match] } as Response;
    }),
  );
}

const quickSubjects = [
  {
    id: 1,
    nameBn: "বাংলা ভাষা ও সাহিত্য",
    nameEn: "Bangla",
    icon: "📖",
    color: "text-emerald-400",
    bg: "bg-emerald-500/10",
    questionCount: 5,
    nodes: [
      {
        id: 1,
        name: "ভাষা",
        path: "ভাষা",
        depth: 1,
        questionCount: 5,
        children: [],
      },
    ],
  },
];

const quickQuestions = [
  {
    id: 101,
    subjectId: 1,
    subject: "বাংলা ভাষা ও সাহিত্য",
    topic: "ভাষা",
    subtopic: "",
    question: "দ্রুত প্রশ্ন ১",
    options: ["ক", "খ", "গ", "ঘ"],
    correctAnswer: "ক",
    explanation: "ব্যাখ্যা",
    difficulty: "EASY",
    year: null,
    sourceExam: "BCS",
    bcsTerm: null,
    questionType: "SINGLE_CHOICE",
    correctAnswers: ["ক"],
    statements: [],
    media: [],
  },
];

const quickSummary = {
  summary: { correct: 1, total: 1, score: 100, pointsEarned: 10, wrong: 0, negativeMarks: 0, finalScore: 1 },
};

async function openQuickAndSelectSubject() {
  const { default: PracticeTab } = await import("@/components/dashboard/PracticeTab");
  const { EcosystemProvider } = await import("@/lib/ecosystem-ctx");
  render(
    <EcosystemProvider>
      <PracticeTab />
    </EcosystemProvider>,
  );
  fireEvent.click(await screen.findByRole("button", { name: /কুইক প্র্যাকটিস/ }));
  const subjectElements = await screen.findAllByText("বাংলা ভাষা ও সাহিত্য");
  fireEvent.click(subjectElements[0]);
}

describe("quick-practice confirm → start → submit", () => {
  beforeEach(() => {
    localStorage.clear();
    stubFetch({
      "/api/exam/config": { subjects: quickSubjects },
      "/api/questions": { questions: quickQuestions },
      "/api/practice/submit": quickSummary,
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("pre-exam confirm shows count/time/scoring, then starts the session", async () => {
    await openQuickAndSelectSubject();
    // Start dock opens the confirmation — it must NOT fetch questions yet.
    fireEvent.click(await screen.findByTestId("dock-start"));
    const dialog = await screen.findByRole("dialog", { name: "প্র্যাকটিস শুরু করুন" });
    expect(within(dialog).getByText(/সঠিক \+১/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /শুরু করুন/ }));
    // Session workspace: stem, wall-clock timer, single-question counter.
    expect(await screen.findByText("দ্রুত প্রশ্ন ১")).toBeInTheDocument();
    expect(screen.getByRole("timer")).toBeInTheDocument();
  });

  it("answer → submit grades and shows results exactly once", async () => {
    await openQuickAndSelectSubject();
    fireEvent.click(await screen.findByTestId("dock-start"));
    fireEvent.click(await screen.findByRole("button", { name: /শুরু করুন/ }));
    await screen.findByText("দ্রুত প্রশ্ন ১");

    fireEvent.click(screen.getByRole("radio", { name: /ক/ }));
    fireEvent.click(screen.getByRole("button", { name: "ফলাফল জমা দিন" }));

    expect(await screen.findByText("প্র্যাকটিস সম্পন্ন!")).toBeInTheDocument();
    const calls = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.filter(([u]) =>
      String(u).startsWith("/api/practice/submit"),
    );
    expect(calls).toHaveLength(1);
    // Double-tap joins the in-flight request — never a duplicate submit.
    expect(loadQueuedPracticeSubmit()).toBeNull();
  });

  it("unanswered submit warns first, then finalizes on confirmation", async () => {
    await openQuickAndSelectSubject();
    fireEvent.click(await screen.findByTestId("dock-start"));
    fireEvent.click(await screen.findByRole("button", { name: /শুরু করুন/ }));
    await screen.findByText("দ্রুত প্রশ্ন ১");

    fireEvent.click(screen.getByRole("button", { name: "ফলাফল জমা দিন" }));
    const dialog = await screen.findByRole("dialog", { name: "উত্তর দেওয়া বাকি আছে" });
    fireEvent.click(within(dialog).getByRole("button", { name: "জমা দিন" }));

    expect(await screen.findByText("প্র্যাকটিস সম্পন্ন!")).toBeInTheDocument();
  });

  it("session wall-clock expiry auto-submits the whole attempt", async () => {
    // Fake timers must engage BEFORE mount: SessionTimer's 1s interval is
    // created on mount, and only fake-scheduled ticks can advance it.
    vi.useFakeTimers();
    try {
      const { default: PracticeTab } = await import("@/components/dashboard/PracticeTab");
      const { EcosystemProvider } = await import("@/lib/ecosystem-ctx");
      render(
        <EcosystemProvider>
          <PracticeTab />
        </EcosystemProvider>,
      );
      await vi.advanceTimersByTimeAsync(200); // config load
      fireEvent.click(screen.getByRole("button", { name: /কুইক প্র্যাকটিস/ }));
      await vi.advanceTimersByTimeAsync(200);
      fireEvent.click(screen.getAllByText("বাংলা ভাষা ও সাহিত্য")[0]);
      fireEvent.click(screen.getByTestId("dock-start"));
      await vi.advanceTimersByTimeAsync(200);
      fireEvent.click(screen.getByRole("button", { name: /শুরু করুন/ }));
      await vi.advanceTimersByTimeAsync(200); // questions load → session starts
      expect(screen.getByText("দ্রুত প্রশ্ন ১")).toBeInTheDocument();

      // Jump past the persisted session deadline; the wall-clock tick must
      // auto-submit the whole attempt (blanks included) exactly once.
      const snap = JSON.parse(
        localStorage.getItem("ninth-grade-ai:practice:quick") as string,
      ) as { durationSec: number };
      expect(snap.durationSec).toBeGreaterThan(0);
      await vi.advanceTimersByTimeAsync((snap.durationSec + 2) * 1000);
      await vi.advanceTimersByTimeAsync(200); // submit round-trip
      const calls = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.filter(([u]) =>
        String(u).startsWith("/api/practice/submit"),
      );
      expect(calls).toHaveLength(1);
      expect(screen.getByText("প্র্যাকটিস সম্পন্ন!")).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("practice offline outbox", () => {
  beforeEach(() => localStorage.clear());

  it("queues, loads, and clears a payload (latest wins)", () => {
    expect(loadQueuedPracticeSubmit()).toBeNull();
    queuePracticeSubmit({
      answers: [{ questionId: 1, selected: "ক" }],
      ecosystem: "BCS",
      queuedAt: Date.now(),
    });
    const loaded = loadQueuedPracticeSubmit();
    expect(loaded?.answers).toHaveLength(1);
    expect(loaded?.ecosystem).toBe("BCS");
    // Latest write wins — a retry never duplicates, it replaces.
    queuePracticeSubmit({
      answers: [
        { questionId: 1, selected: "ক" },
        { questionId: 2, selected: "" },
      ],
      ecosystem: "BCS",
      queuedAt: Date.now(),
    });
    expect(loadQueuedPracticeSubmit()?.answers).toHaveLength(2);
    clearQueuedPracticeSubmit();
    expect(loadQueuedPracticeSubmit()).toBeNull();
  });

  it("drops corrupt payloads instead of wedging retries", () => {
    localStorage.setItem("ninth-grade-ai:practice:submit-queue", "{corrupt");
    expect(loadQueuedPracticeSubmit()).toBeNull();
    localStorage.setItem(
      "ninth-grade-ai:practice:submit-queue",
      JSON.stringify({ answers: [], ecosystem: "BCS" }),
    );
    expect(loadQueuedPracticeSubmit()).toBeNull();
  });

  it("classifies network failures vs server rejections", () => {
    expect(isNetworkFailure(new Error("NETWORK_ERROR: fetch failed"))).toBe(true);
    expect(isNetworkFailure(new Error("request timed out"))).toBe(true);
    expect(isNetworkFailure(new Error("Failed to fetch"))).toBe(true);
    expect(isNetworkFailure(new Error("ATTEMPT_HASH_MISMATCH"))).toBe(false);
    expect(isNetworkFailure(new Error("grading failed"))).toBe(false);
  });
});

describe("SessionTimer wall-clock expiry", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("fires onExpire exactly once when the deadline passes", () => {
    const onExpire = vi.fn();
    const startsAt = Date.now() - 58_000;
    render(<SessionTimer startsAt={startsAt} durationSec={60} onExpire={onExpire} />);
    expect(onExpire).not.toHaveBeenCalled();
    vi.advanceTimersByTime(3000);
    expect(onExpire).toHaveBeenCalledTimes(1);
    // Extra ticks must not re-fire (no duplicate auto-submits).
    vi.advanceTimersByTime(10_000);
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it("announces remaining time via role=timer without per-second live spam", () => {
    const { container } = render(
      <SessionTimer startsAt={Date.now()} durationSec={600} onExpire={() => {}} />,
    );
    const timer = container.querySelector('[role="timer"]');
    expect(timer).not.toBeNull();
    expect(timer?.getAttribute("aria-label")).toMatch(/বাকি সময়/);
    // Outer is aria-live=off; only the sr-only node is polite.
    expect(timer?.getAttribute("aria-live")).toBe("off");
  });
});

describe("quick-practice offline banner + retry", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("shows the queued banner and recovers via retry", async () => {
    queuePracticeSubmit({
      answers: [{ questionId: 7, selected: "খ" }],
      ecosystem: "BCS",
      queuedAt: Date.now(),
    });
    const submitPractice = vi.fn(async () => ({
      correct: 1,
      total: 1,
      score: 100,
      pointsEarned: 10,
    }));
    vi.doMock("@/lib/services/api", () => ({
      api: {
        examConfig: async () => [],
        questions: async () => [],
        submitPractice,
        recordRecCompleted: () => {},
      },
    }));
    const { default: PracticeTab } = await import("@/components/dashboard/PracticeTab");
    const { EcosystemProvider } = await import("@/lib/ecosystem-ctx");
    render(
      <EcosystemProvider>
        <PracticeTab />
      </EcosystemProvider>,
    );
    // Quick mode is not default (custom is) — flip to quick via the mode card.
    const quickCard = await screen.findByRole("button", { name: /quick practice|কুইক প্র্যাকটিস/i });
    fireEvent.click(quickCard);
    const retry = await screen.findByRole("button", { name: /আবার জমা দিন/i });
    expect(retry).toBeTruthy();
    fireEvent.click(retry);
    await waitFor(() => expect(submitPractice).toHaveBeenCalledTimes(1));
    expect(loadQueuedPracticeSubmit()).toBeNull();
    await screen.findByText(/প্র্যাকটিস সম্পন্ন/i);
  });
});
