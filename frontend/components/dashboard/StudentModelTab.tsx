"use client";

import { useEffect, useState } from "react";
import { getStudentModel } from "@/lib/services/ai/studentModel";
import type { StudentModelDto } from "@/lib/services/ai/types";

export default function StudentModelTab() {
  const [model, setModel] = useState<StudentModelDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getStudentModel()
      .then((m) => active && setModel(m))
      .catch((e) => active && setError(e instanceof Error ? e.message : "প্রোফাইল লোড করা যায়নি।"))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  if (loading) {
    return <div className="px-4 py-6 text-sm text-[var(--dashboard-text-muted)]">লোড হচ্ছে…</div>;
  }
  if (error) {
    return <div className="px-4 py-6 text-sm text-[var(--dashboard-danger)]">{error}</div>;
  }
  if (!model) return null;

  const hasData =
    model.weakTopics.length > 0 ||
    model.strongTopics.length > 0 ||
    model.examGoal ||
    model.totalAiQuestions > 0;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-6">
      <div>
        <h1 className="text-xl font-semibold text-[var(--dashboard-text-primary)]">দীর্ঘমেয়াদী শিক্ষার্থী প্রোফাইল</h1>
        <p className="mt-1 text-sm text-[var(--dashboard-text-muted)]">
          তোমার লক্ষ্য, ভাষা এবং দুর্বল-শক্ত বিষয় AI ধরে রাখে — যাতে পরবর্তী পড়াশোনা ব্যক্তিগতকৃত হয়।
        </p>
      </div>

      {!hasData && (
        <p className="rounded-xl border border-[var(--border-subtle)] bg-[var(--dashboard-surface)] px-3 py-2 text-sm text-[var(--dashboard-text-muted)]">
          এখনো যথেষ্ট তথ্য নেই। &quot;উত্তর মূল্যায়ন&quot; বা &quot;AI সলভার&quot; ব্যবহার করলে এখানে তোমার দুর্বল বিষয় জমা হবে।
        </p>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Card title="লক্ষ্য (Exam Goal)">
          {model.examGoal ?? <Muted>নির্ধারিত নয়</Muted>}
        </Card>
        <Card title="পছন্দের ভাষা">
          {model.preferredLanguage ?? <Muted>স্বয়ংক্রিয় শনাক্ত</Muted>}
        </Card>
        <Card title="মূল্যায়ন করা উত্তর">
          {model.evaluatedCount} টি
        </Card>
        <Card title="মোট AI প্রশ্ন">
          {model.totalAiQuestions} টি
        </Card>
      </div>

      {model.weakTopics.length > 0 && (
        <div className="rounded-2xl border border-[var(--danger)]/20 bg-[var(--dashboard-danger-subtle)] p-4">
          <h3 className="mb-2 text-sm font-semibold text-[var(--dashboard-danger)]">দুর্বল বিষয় (উন্নতি করো)</h3>
          <ul className="space-y-2">
            {model.weakTopics.map((t, i) => (
              <li key={i} className="text-sm text-[var(--dashboard-text-secondary)]">
                <span className="font-medium text-[var(--dashboard-text-primary)]">{t.topic}</span>
                {t.detail && <span className="text-[var(--dashboard-text-muted)]"> — {t.detail}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {model.strongTopics.length > 0 && (
        <div className="rounded-2xl border border-[var(--primary)]/20 bg-[var(--dashboard-primary-subtle)] p-4">
          <h3 className="mb-2 text-sm font-semibold text-[var(--dashboard-primary)]">শক্ত বিষয়</h3>
          <ul className="space-y-1">
            {model.strongTopics.map((t, i) => (
              <li key={i} className="text-sm text-[var(--dashboard-text-secondary)]">
                <span className="font-medium text-[var(--dashboard-text-primary)]">{t.topic}</span>
                {t.detail && <span className="text-[var(--dashboard-text-muted)]"> — {t.detail}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {model.usageByTask.length > 0 && (
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--dashboard-surface)] p-4">
          <h3 className="mb-2 text-sm font-semibold text-[var(--dashboard-text-primary)]">ব্যবহারের ধরন</h3>
          <div className="flex flex-wrap gap-2">
            {model.usageByTask.map((u) => (
              <span key={u.task} className="rounded-full border border-[var(--border-subtle)] bg-[var(--dashboard-surface-muted)] px-3 py-1 text-xs text-[var(--dashboard-text-secondary)]">
                {u.task}: {u.count}
              </span>
            ))}
          </div>
        </div>
      )}

      {model.lastActive && (
        <p className="text-xs text-[var(--dashboard-text-muted)]">সর্বশেষ সক্রিয়: {new Date(model.lastActive).toLocaleString("bn-BD")}</p>
      )}
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--dashboard-surface)] p-4">
      <div className="text-xs uppercase tracking-wide text-[var(--dashboard-text-muted)]">{title}</div>
      <div className="mt-1 text-sm text-[var(--dashboard-text-primary)]">{children}</div>
    </div>
  );
}

function Muted({ children }: { children: React.ReactNode }) {
  return <span className="text-[var(--dashboard-text-muted)]">{children}</span>;
}
