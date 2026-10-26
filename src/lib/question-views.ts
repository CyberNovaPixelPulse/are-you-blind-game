import { isQuestionId } from "@/lib/seen-questions";

export function recordQuestionView(questionId: string) {
  if (!isQuestionId(questionId)) return;
  void fetch("/api/questions/view", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ questionId }),
  }).catch(() => undefined);
}
