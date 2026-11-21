import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import VocabEnrichment, { speakVocab } from "@/components/dashboard/vocab/VocabEnrichment";
import { LanguageProvider } from "@/lib/lang-ctx";

function renderEnrichment(props: Record<string, unknown> = {}) {
  return render(
    <LanguageProvider>
      <VocabEnrichment word="Abate" {...props} />
    </LanguageProvider>,
  );
}

describe("VocabEnrichment", () => {
  it("renders nothing when there is no enrichment data", () => {
    const { container } = renderEnrichment();
    expect(container.firstChild).toBeNull();
  });

  it("renders IPA, register, collocations, word family and confusables", () => {
    renderEnrichment({
      ipa: "əˈbeɪt",
      register: "formal",
      collocations: ["abate a threat", "abate noise"],
      wordFamily: ["abatement", "unabated"],
      confusables: ["abate", "abet"],
    });
    expect(screen.getByText("/əˈbeɪt/")).toBeInTheDocument();
    expect(screen.getByText("formal")).toBeInTheDocument();
    expect(screen.getByText("Collocations")).toBeInTheDocument();
    expect(screen.getByText("abate a threat")).toBeInTheDocument();
    expect(screen.getByText("Word family")).toBeInTheDocument();
    expect(screen.getByText("abatement")).toBeInTheDocument();
    expect(screen.getByText("Confusables")).toBeInTheDocument();
    expect(screen.getByText("abet")).toBeInTheDocument();
  });

  it("shows a pronunciation button only when an audio URL exists", () => {
    renderEnrichment({ audioUrl: "/audio/abate.mp3" });
    expect(screen.getByRole("button", { name: "Play pronunciation of Abate" })).toBeInTheDocument();
  });
});

describe("speakVocab", () => {
  const play = vi.fn();
  const speak = vi.fn();
  const cancel = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    play.mockResolvedValue(undefined);
    vi.stubGlobal("Audio", vi.fn(() => ({ play })));
    Object.defineProperty(window, "speechSynthesis", {
      configurable: true,
      value: { speak, cancel },
    });
    vi.stubGlobal("SpeechSynthesisUtterance", vi.fn((word: string) => ({ word })));
  });

  afterEach(() => vi.unstubAllGlobals());

  it("plays the recorded audio when available", () => {
    speakVocab("Abate", "/audio/abate.mp3");
    expect(vi.mocked(Audio)).toHaveBeenCalledWith("/audio/abate.mp3");
    expect(play).toHaveBeenCalled();
    expect(speak).not.toHaveBeenCalled();
  });

  it("falls back to browser TTS when there is no recording", () => {
    speakVocab("Abate");
    expect(vi.mocked(Audio)).not.toHaveBeenCalled();
    expect(cancel).toHaveBeenCalled();
    expect(speak).toHaveBeenCalled();
  });

  it("falls back to TTS when the recording fails to play", async () => {
    play.mockRejectedValue(new Error("blocked"));
    speakVocab("Abate", "/audio/abate.mp3");
    expect(play).toHaveBeenCalled();
    await waitFor(() => expect(speak).toHaveBeenCalled());
  });
});
