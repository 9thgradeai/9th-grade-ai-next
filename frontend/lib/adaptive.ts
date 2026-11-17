/**
 * Adaptive Behavior Utilities
 * User preference detection, peak hours, adaptive UI, smart defaults.
 */

import { useEffect, useState, useCallback, useMemo } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// USER PREFERENCES
// ─────────────────────────────────────────────────────────────────────────────

export interface UserPreferences {
  theme: 'light' | 'dark' | 'system';
  density: 'compact' | 'comfortable' | 'spacious';
  animations: 'full' | 'reduced' | 'none';
  language: 'bn' | 'en' | 'auto';
  ecosystem: 'BCS' | 'BANK' | 'TEACHER' | 'AUTO';
  reducedMotion: boolean;
  highContrast: boolean;
  reducedTransparency: boolean;
}

const DEFAULT_PREFERENCES: UserPreferences = {
  theme: 'system',
  density: 'comfortable',
  animations: 'full',
  language: 'auto',
  ecosystem: 'AUTO',
  reducedMotion: false,
  highContrast: false,
  reducedTransparency: false,
};

const STORAGE_KEY = '9th-grade-ai-preferences';

/** Load preferences from localStorage */
export function loadPreferences(): UserPreferences {
  if (typeof window === 'undefined') return DEFAULT_PREFERENCES;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return { ...DEFAULT_PREFERENCES, ...JSON.parse(stored) };
    }
  } catch {
    // Ignore parse errors
  }
  return DEFAULT_PREFERENCES;
}

/** Save preferences to localStorage */
export function savePreferences(prefs: Partial<UserPreferences>): UserPreferences {
  if (typeof window === 'undefined') return DEFAULT_PREFERENCES;
  const current = loadPreferences();
  const next = { ...current, ...prefs };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    // Dispatch event for cross-tab sync
    window.dispatchEvent(new CustomEvent('preferences-changed', { detail: next }));
  } catch {
    // Ignore storage errors
  }
  return next;
}

/** Hook for reactive preferences */
export function usePreferences(): [UserPreferences, (prefs: Partial<UserPreferences>) => void] {
  const [prefs, setPrefs] = useState<UserPreferences>(DEFAULT_PREFERENCES);

  useEffect(() => {
    setPrefs(loadPreferences());

    const handleStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && e.newValue) {
        setPrefs(JSON.parse(e.newValue));
      }
    };

    const handleCustom = (e: CustomEvent) => {
      setPrefs(e.detail);
    };

    window.addEventListener('storage', handleStorage);
    window.addEventListener('preferences-changed', handleCustom as EventListener);

    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('preferences-changed', handleCustom as EventListener);
    };
  }, []);

  const updatePrefs = useCallback((newPrefs: Partial<UserPreferences>) => {
    setPrefs((prev) => savePreferences({ ...prev, ...newPrefs }));
  }, []);

  return [prefs, updatePrefs];
}

// ─────────────────────────────────────────────────────────────────────────────
// PEAK HOURS DETECTION
// ─────────────────────────────────────────────────────────────────────────────

export interface ActivityPattern {
  hour: number; // 0-23
  count: number;
}

export interface PeakHoursResult {
  peakHours: number[]; // Hours with highest activity
  activeHours: number[]; // Hours with any activity
  isPeakNow: boolean;
  nextPeak: number | null; // Next peak hour
  suggestion: string;
}

/** Analyze user activity to find peak hours */
export function analyzePeakHours(activities: ActivityPattern[]): PeakHoursResult {
  if (activities.length === 0) {
    return {
      peakHours: [19, 20, 21], // Default evening
      activeHours: [],
      isPeakNow: false,
      nextPeak: 19,
      suggestion: 'Most students study 7-10 PM',
    };
  }

  // Sort by count descending
  const sorted = [...activities].sort((a, b) => b.count - a.count);
  const maxCount = sorted[0]?.count ?? 0;
  const threshold = maxCount * 0.5; // 50% of peak

  const peakHours = sorted.filter((a) => a.count >= threshold).map((a) => a.hour);
  const activeHours = activities.filter((a) => a.count > 0).map((a) => a.hour);

  const now = new Date().getHours();
  const isPeakNow = peakHours.includes(now);

  // Find next peak hour
  let nextPeak: number | null = null;
  for (let i = 1; i <= 24; i++) {
    const hour = (now + i) % 24;
    if (peakHours.includes(hour)) {
      nextPeak = hour;
      break;
    }
  }

  let suggestion = 'Your peak focus time';
  if (nextPeak !== null && nextPeak !== now) {
    const diff = (nextPeak - now + 24) % 24;
    if (diff <= 3) {
      suggestion = `Peak focus in ${diff}h (${nextPeak}:00)`;
    } else {
      suggestion = `Next peak: ${nextPeak}:00`;
    }
  } else if (isPeakNow) {
    suggestion = 'Peak focus time now!';
  }

  return { peakHours, activeHours, isPeakNow, nextPeak, suggestion };
}

/** Hook for peak hours based on user's practice history */
export function usePeakHours(activities: ActivityPattern[] | null) {
  return useMemo(() => (activities ? analyzePeakHours(activities) : null), [activities]);
}

// ─────────────────────────────────────────────────────────────────────────────
// ADAPTIVE UI
// ─────────────────────────────────────────────────────────────────────────────

export interface AdaptiveConfig {
  /** Show advanced features after this many sessions */
  advancedThreshold?: number;
  /** Show weak subject emphasis when accuracy below */
  weakSubjectThreshold?: number;
  /** Auto-switch to mock mode when exam within days */
  examProximityDays?: number;
  /** Suggest break after minutes of continuous practice */
  breakSuggestionMinutes?: number;
}

export const DEFAULT_ADAPTIVE_CONFIG: Required<AdaptiveConfig> = {
  advancedThreshold: 10,
  weakSubjectThreshold: 60,
  examProximityDays: 14,
  breakSuggestionMinutes: 45,
};

/** Get adaptive UI recommendations */
export function getAdaptiveRecommendations(
  userStats: {
    totalSessions: number;
    weakSubjects: string[];
    averageAccuracy: number;
    daysToExam: number | null;
    currentSessionMinutes: number;
  },
  config: AdaptiveConfig = {}
): {
  showAdvanced: boolean;
  emphasizeWeakSubjects: string[];
  suggestMockMode: boolean;
  suggestBreak: boolean;
  messages: string[];
} {
  const c = { ...DEFAULT_ADAPTIVE_CONFIG, ...config };
  const messages: string[] = [];

  const showAdvanced = userStats.totalSessions >= c.advancedThreshold;
  const emphasizeWeakSubjects = userStats.weakSubjects.filter(
    (s) => userStats.averageAccuracy < c.weakSubjectThreshold
  );
  const suggestMockMode =
    userStats.daysToExam !== null && userStats.daysToExam <= c.examProximityDays;
  const suggestBreak = userStats.currentSessionMinutes >= c.breakSuggestionMinutes;

  if (showAdvanced) {
    messages.push('Advanced analytics unlocked');
  }
  if (emphasizeWeakSubjects.length > 0) {
    messages.push(`Focus on: ${emphasizeWeakSubjects.slice(0, 2).join(', ')}`);
  }
  if (suggestMockMode) {
    messages.push(`Exam in ${userStats.daysToExam} days — try mock tests`);
  }
  if (suggestBreak) {
    messages.push('Consider a short break');
  }

  return { showAdvanced, emphasizeWeakSubjects, suggestMockMode, suggestBreak, messages };
}

// ─────────────────────────────────────────────────────────────────────────────
// SMART DEFAULTS
// ─────────────────────────────────────────────────────────────────────────────

export interface SmartDefaults {
  practiceMode: 'quick' | 'mock' | 'custom';
  questionCount: number;
  durationMinutes: number;
  difficulty: 'ALL' | 'EASY' | 'MEDIUM' | 'HARD';
  subjects: string[];
}

/** Generate smart defaults based on user history and context */
export function getSmartDefaults(
  context: {
    timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night';
    dayOfWeek: number; // 0-6
    daysToExam: number | null;
    recentMode: 'quick' | 'mock' | 'custom' | null;
    recentSubjects: string[];
    recentQuestionCount: number;
    recentDuration: number;
    averageAccuracy: number;
  }
): SmartDefaults {
  const { timeOfDay, dayOfWeek, daysToExam, recentMode, recentSubjects, averageAccuracy } = context;

  // Weekend = more time for mock
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
  // Exam proximity = mock mode
  const examSoon = daysToExam !== null && daysToExam <= 14;

  let practiceMode: SmartDefaults['practiceMode'] = 'quick';
  if (examSoon) practiceMode = 'mock';
  else if (isWeekend && timeOfDay === 'morning') practiceMode = 'mock';
  else if (recentMode === 'mock' && !examSoon) practiceMode = 'quick';

  // Question count based on time available and mode
  let questionCount = 20;
  if (practiceMode === 'mock') questionCount = 100;
  else if (timeOfDay === 'night') questionCount = 10;
  else if (timeOfDay === 'morning' && isWeekend) questionCount = 50;

  // Duration: 30s per question for quick, fixed for mock
  const durationMinutes = practiceMode === 'mock' ? 120 : Math.max(5, Math.round(questionCount * 0.5));

  // Difficulty based on accuracy
  let difficulty: SmartDefaults['difficulty'] = 'ALL';
  if (averageAccuracy > 85) difficulty = 'HARD';
  else if (averageAccuracy < 50) difficulty = 'EASY';

  // Subjects: recent + weak areas
  const subjects = recentSubjects.slice(0, 3);

  return { practiceMode, questionCount, durationMinutes, difficulty, subjects };
}

// ─────────────────────────────────────────────────────────────────────────────
// NOTIFICATION TIMING
// ─────────────────────────────────────────────────────────────────────────────

export interface NotificationSchedule {
  /** Preferred notification hours (24h format) */
  hours: number[];
  /** Days of week (0=Sun) */
  days: number[];
  /** Timezone offset in minutes */
  timezoneOffset: number;
}

/** Get optimal notification time based on user activity */
export function getOptimalNotificationTime(
  peakHours: PeakHoursResult,
  schedule: Partial<NotificationSchedule> = {}
): { hour: number; reason: string } | null {
  const { hours = [19, 20], days = [1, 2, 3, 4, 5] } = schedule; // Weekday evenings default
  const now = new Date();
  const currentHour = now.getHours();
  const currentDay = now.getDay();

  // If today is a notification day and we're before the first hour
  if (days.includes(currentDay)) {
    for (const hour of hours) {
      if (currentHour < hour) {
        return { hour, reason: `Scheduled for ${hour}:00 today` };
      }
    }
  }

  // Find next notification day
  for (let i = 1; i <= 7; i++) {
    const day = (currentDay + i) % 7;
    if (days.includes(day)) {
      return { hour: hours[0], reason: `Next ${dayName(day)} at ${hours[0]}:00` };
    }
  }

  return null;
}

function dayName(day: number): string {
  const names = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return names[day];
}

// ─────────────────────────────────────────────────────────────────────────────
// DEVICE CAPABILITIES
// ─────────────────────────────────────────────────────────────────────────────

export interface DeviceCapabilities {
  hasTouch: boolean;
  hasHover: boolean;
  hasFinePointer: boolean;
  hasCoarsePointer: boolean;
  prefersReducedMotion: boolean;
  prefersHighContrast: boolean;
  prefersReducedTransparency: boolean;
  maxTouchPoints: number;
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  pixelRatio: number;
  viewportWidth: number;
  viewportHeight: number;
}

/** Detect device capabilities */
export function getDeviceCapabilities(): DeviceCapabilities {
  if (typeof window === 'undefined') {
    return {
      hasTouch: false,
      hasHover: true,
      hasFinePointer: true,
      hasCoarsePointer: false,
      prefersReducedMotion: false,
      prefersHighContrast: false,
      prefersReducedTransparency: false,
      maxTouchPoints: 0,
      isMobile: false,
      isTablet: false,
      isDesktop: true,
      pixelRatio: 1,
      viewportWidth: 1024,
      viewportHeight: 768,
    };
  }

  const mq = window.matchMedia.bind(window);
  const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  const hasHover = mq('(hover: hover)').matches;
  const hasFinePointer = mq('(pointer: fine)').matches;
  const hasCoarsePointer = mq('(pointer: coarse)').matches;

  const width = window.innerWidth;
  const isMobile = width < 768;
  const isTablet = width >= 768 && width < 1024;
  const isDesktop = width >= 1024;

  return {
    hasTouch,
    hasHover,
    hasFinePointer,
    hasCoarsePointer,
    prefersReducedMotion: mq('(prefers-reduced-motion: reduce)').matches,
    prefersHighContrast: mq('(prefers-contrast: more)').matches,
    prefersReducedTransparency: mq('(prefers-reduced-transparency: reduce)').matches,
    maxTouchPoints: navigator.maxTouchPoints || 0,
    isMobile,
    isTablet,
    isDesktop,
    pixelRatio: window.devicePixelRatio || 1,
    viewportWidth: width,
    viewportHeight: window.innerHeight,
  };
}

/** Hook for reactive device capabilities */
export function useDeviceCapabilities(): DeviceCapabilities {
  const [caps, setCaps] = useState<DeviceCapabilities>(() => getDeviceCapabilities());

  useEffect(() => {
    const handleResize = () => setCaps(getDeviceCapabilities());
    const mqMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const mqContrast = window.matchMedia('(prefers-contrast: more)');
    const mqTransparency = window.matchMedia('(prefers-reduced-transparency: reduce)');

    const update = () => setCaps(getDeviceCapabilities());

    window.addEventListener('resize', handleResize);
    mqMotion.addEventListener('change', update);
    mqContrast.addEventListener('change', update);
    mqTransparency.addEventListener('change', update);

    return () => {
      window.removeEventListener('resize', handleResize);
      mqMotion.removeEventListener('change', update);
      mqContrast.removeEventListener('change', update);
      mqTransparency.removeEventListener('change', update);
    };
  }, []);

  return caps;
}

// ─────────────────────────────────────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────────────────────────────────────

export type {}; // types are exported at their declaration sites above