/* Analytics tracking for cosmic theme feedback and interactions */

type AnalyticsEvent =
  | "hero_view_start"
  | "hero_view_end"
  | "hero_view_duration"
  | "cta_primary_click"
  | "cta_secondary_click"
  | "feedback_submitted";

interface HeroViewData {
  duration_ms: number | undefined;
}

interface CtaClickData {
  cta_type: "primary" | "secondary";
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
  | { event: "feedback_submitted"; data: FeedbackData };

class Analytics {
  private readonly enabled: boolean;
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
    // eslint-disable-next-line no-restricted-globals
    this.enabled = !!process.env.NEXT_PUBLIC_ANALYTICS_ENDPOINT;
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
      console.log("[Analytics]", eventData.event, eventData.data);
      return;
    }

    // Send to analytics endpoint
    // TODO: Implement actual endpoint POST
    // eslint-disable-next-line no-restricted-globals
    fetch(process.env.NEXT_PUBLIC_ANALYTICS_ENDPOINT!, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    }).catch((err) => {
      console.error("Analytics send failed:", err);
      this.events.push(eventData.event);
    });
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

export const trackCtaClick = (ctaType: "primary" | "secondary") => {
  analytics.track({ event: `cta_${ctaType}_click`, data: { cta_type: ctaType } });
};

export const trackFeedbackSubmission = (responses: {
  visual_style: string;
  content_distraction: string;
  preferred_style: string;
}) => {
  analytics.track({ event: "feedback_submitted", data: responses });
};
