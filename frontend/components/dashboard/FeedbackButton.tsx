"use client";

import { useState } from "react";

export const FeedbackButton = () => {
  const [showModal, setShowModal] = useState(false);

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className="fixed bottom-6 right-6 z-50 hidden sm:block bg-stellar-cyan/90 backdrop-blur-sm border border-white/20 rounded-full p-3 hover:bg-stellar-cyan/100 transition-colors focus:outline-none focus:ring-2 focus:ring-stellar-cyan/50 focus:ring-offset-2"
        aria-label="Provide feedback on the cosmic theme"
      >
        ⭐
      </button>

      {showModal && (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center"
        >
          <div
            className="bg-zinc-950 rounded-xl p-8 max-w-md w-full transform scale-95 opacity-0 transition-all duration-300 aria-modal"
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-stellar-cyan">Help Us Improve</h2>
              <button
                onClick={() => setShowModal(false)}
                className="text-zinc-400 hover:text-stellar-cyan transition-colors"
                aria-label="Close feedback modal"
              >
                ✕
              </button>
            </div>

            <p className="text-zinc-300 mb-8 leading-relaxed">
              We&apos;d love to hear your thoughts on the new cosmic visual theme:
            </p>

            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                // TODO: Send feedback to analytics
                setShowModal(false);
              }}
            >
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-2">
                  How do you feel about the visual style?
                </label>
                <select
                  name="visual-style"
                  className="w-full px-4 py-2 border border-zinc-600 rounded bg-zinc-900 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-stellar-cyan/50"
                  required
                >
                  <option value="positive">Positive - I love it</option>
                  <option value="neutral">Neutral - It&apos;s fine</option>
                  <option value="negative">Negative - I prefer the old style</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-2">
                  Does the background distract from the content?
                </label>
                <select
                  name="content-distraction"
                  className="w-full px-4 py-2 border border-zinc-600 rounded bg-zinc-900 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-stellar-cyan/50"
                  required
                >
                  <option value="not-at-all">Not at all - it&apos;s subtle</option>
                  <option value="slightly">Slightly - needs adjustment</option>
                  <option value="significantly">Significantly - very distracting</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-2">
                  Would you prefer a different visual style?
                </label>
                <select
                  name="preferred-style"
                  className="w-full px-4 py-2 border border-zinc-600 rounded bg-zinc-900 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-stellar-cyan/50"
                  required
                >
                  <option value="keep-cosmic">Keep the cosmic/stellar theme</option>
                  <option value="return-terminal">Return to terminal theme</option>
                  <option value="minimalist">Minimalist/clean style</option>
                  <option value="other">Other (please specify)</option>
                </select>
              </div>

              <div className="flex gap-3">
                <button
                  type="submit"
                  className="flex-1 bg-stellar-cyan text-zinc-950 font-medium py-2 rounded hover:bg-stellar-cyan/90 transition-colors"
                >
                  Submit Feedback
                </button>
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 bg-zinc-800 text-zinc-400 font-medium py-2 rounded hover:bg-zinc-700 transition-colors"
                >
                  Skip
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
};