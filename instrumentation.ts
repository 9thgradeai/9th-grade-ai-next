// Server startup hook — registers domain-event subscribers exactly once per
// process so badge awarding reacts to exam/practice/quiz/flashcard events.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { registerSubscribers } = await import("~backend/events/subscribers");
  registerSubscribers();
}
