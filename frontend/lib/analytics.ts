/* Analytics tracking for cosmic theme feedback and interactions */

type AnalyticsEvent =
  | "hero_view_start"
  | "hero_view_end"
  | "hero_view_duration"
  | "cta_primary_click"
  | "cta_secondary_click"
  | "cta_tertiary_click"
  | "feedback_submitted"
  | "exam_start"
  | "exam_complete"
  | "exam_export";

interface ExamData {
  examId: string;
  durationMs?: number;
  score?: number;
  total?: number;
}

interface ExamExportData {
  examId: string;
  format: "pdf" | "png";
  includeAnswers: boolean;
}

interface HeroViewData {
  duration_ms: number | undefined;
}

interface CtaClickData {
  cta_type: "primary" | "secondary" | "tertiary";
}

interface FeedbackData {
  visual_style: string;
  content_distraction: string;
  preferred_style: string;
}

type AnalyticsData =
  | { event: "hero_view_duration"; data: HeroViewData }
  | { event: "cta_primary_click"; data: CtaClickData }
  | { event: "cta_secondary_click"; data: CtaClickData }
  | { event: "cta_tertiary_click"; data: CtaClickData }
  | { event: "feedback_submitted"; data: FeedbackData }
  | { event: "exam_start"; data: { examId: string } }
  | { event: "exam_complete"; data: { examId: string; durationMs: number; score: number; total: number } }
  | { event: "exam_export"; data: { examId: string; format: "pdf" | "png"; includeAnswers: boolean } };

class Analytics {
  private readonly enabled: boolean;
  private readonly endpoint: string | undefined;
  private readonly heroView: {
    startTime: number;
    endTime?: number;
    duration?: number;
  } = {
    startTime: 0,
    endTime: undefined,
    duration: undefined,
  };
  private readonly events: AnalyticsEvent[] = [];

  constructor() {
    // eslint-disable-next-line no-restricted-globals -- NEXT_PUBLIC_* inlined by Next.js at build time
    this.endpoint = process.env.NEXT_PUBLIC_ANALYTICS_ENDPOINT;
    this.enabled = !!this.endpoint;
    this.startHeroView();
  }

  private startHeroView() {
    this.heroView.startTime = Date.now();
  }

  private endHeroView() {
    this.heroView.endTime = Date.now();
    this.heroView.duration = this.heroView.endTime - this.heroView.startTime;
    this.track({ event: "hero_view_duration", data: { duration_ms: this.heroView.duration } });
  }

  track(eventData: AnalyticsData) {
    const payload = {
      event: eventData.event,
      timestamp: Date.now(),
      ...(eventData.data ? { data: eventData.data } : {}),
    };

    if (!this.enabled) {
      // Fall back to local storage for development/debugging
      this.events.push(eventData.event);
      if (process.env.NODE_ENV === "development") console.log("[Analytics]", eventData.event, eventData.data);
      return;
    }

    // Send to analytics endpoint (failures buffer locally for retry).
    fetch(this.endpoint!, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    }).catch((err) => {
      if (process.env.NODE_ENV === "development") console.error("Analytics send failed:", err);
      this.events.push(eventData.event);
    });
  }

  trackExamStart(examId: string) {
    this.track({ event: "exam_start", data: { examId } });
  }

  trackExamComplete(examId: string, durationMs: number, score: number, total: number) {
    this.track({ event: "exam_complete", data: { examId, durationMs, score, total } });
  }

  trackExamExport(examId: string, format: "pdf" | "png", includeAnswers: boolean) {
    this.track({ event: "exam_export", data: { examId, format, includeAnswers } });
  }

  getEvents(): AnalyticsEvent[] {
    return this.events;
  }

  // Expose for testing/inspection
  get metrics() {
    return {
      ...this.heroView,
      eventCount: this.events.length,
    };
  }
}

export const analytics = new Analytics();

// Helper functions for common tracking patterns
export const trackHeroView = (durationMs: number) => {
  analytics.track({ event: "hero_view_duration", data: { duration_ms: durationMs } });
};

export const trackCtaClick = (ctaType: "primary" | "secondary" | "tertiary") => {
  analytics.track({ event: `cta_${ctaType}_click`, data: { cta_type: ctaType } });
};

export const trackExamStart = (examId: string) => {
  analytics.trackExamStart(examId);
};

export const trackExamComplete = (examId: string, durationMs: number, score: number, total: number) => {
  analytics.trackExamComplete(examId, durationMs, score, total);
};

export const trackExamExport = (examId: string, format: "pdf" | "png", includeAnswers: boolean) => {
  analytics.trackExamExport(examId, format, includeAnswers);
};

export const trackFeedbackSubmission = (responses: {
  visual_style: string;
  content_distraction: string;
  preferred_style: string;
}) => {
  analytics.track({ event: "feedback_submitted", data: responses });
};
