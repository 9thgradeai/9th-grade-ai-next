import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { detectVoiceLang, useVoiceInput, useVoiceOutput } from "@/lib/hooks/useVoice";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("detectVoiceLang", () => {
  it("detects Bengali vs English", () => {
    expect(detectVoiceLang("বাংলাদেশের রাজধানী কোথায়?")).toBe("bn-BD");
    expect(detectVoiceLang("What is the capital?")).toBe("en-US");
  });
});

describe("useVoiceInput", () => {
  it("reports unsupported with no recognizer and refuses to start", () => {
    const { result } = renderHook(() =>
      useVoiceInput({ onTranscript: vi.fn() }),
    );
    expect(result.current.supported).toBe(false);
    expect(result.current.listening).toBe(false);
    let err: string | null = null;
    act(() => {
      err = result.current.start();
    });
    expect(err).toBe("unsupported");
  });

  it("streams interim transcripts and stops on end", () => {
    const listeners: Record<string, ((ev: any) => void) | null> = {
      onresult: null,
      onerror: null,
      onend: null,
    };
    const instances: any[] = [];
    vi.stubGlobal("SpeechRecognition", function (this: any) {
      instances.push(this);
      this.lang = "";
      this.interimResults = false;
      this.continuous = false;
      this.start = vi.fn();
      this.stop = vi.fn();
      Object.defineProperties(this, {
        onresult: { set: (v) => { listeners.onresult = v; }, get: () => listeners.onresult },
        onerror: { set: (v) => { listeners.onerror = v; }, get: () => listeners.onerror },
        onend: { set: (v) => { listeners.onend = v; }, get: () => listeners.onend },
      });
    });

    const onTranscript = vi.fn();
    const { result } = renderHook(() =>
      useVoiceInput({ lang: "bn-BD", interimResults: true, onTranscript }),
    );
    expect(result.current.supported).toBe(true);

    act(() => {
      expect(result.current.start()).toBeNull();
    });
    expect(result.current.listening).toBe(true);

    act(() => {
      listeners.onresult?.({
        results: [{ 0: { transcript: "হ্যালো" }, isFinal: false }],
      });
    });
    expect(onTranscript).toHaveBeenCalledWith("হ্যালো", false);

    act(() => {
      listeners.onend?.();
    });
    expect(result.current.listening).toBe(false);
  });
});

describe("useVoiceOutput", () => {
  it("speaks with auto-detected language and cancels", () => {
    const spoken: any[] = [];
    const cancel = vi.fn();
    vi.stubGlobal("speechSynthesis", {
      speak: (u: any) => {
        spoken.push(u);
        u.onstart?.();
      },
      cancel,
    });
    vi.stubGlobal("SpeechSynthesisUtterance", function (this: any, text: string) {
      this.text = text;
      this.lang = "";
    } as any);

    const { result } = renderHook(() => useVoiceOutput());
    act(() => {
      result.current.speak("বাংলাদেশ");
    });
    expect(spoken).toHaveLength(1);
    expect(spoken[0].lang).toBe("bn-BD");
    expect(result.current.speaking).toBe(true);

    act(() => {
      result.current.cancel();
    });
    expect(cancel).toHaveBeenCalled();
    expect(result.current.speaking).toBe(false);
  });
});
