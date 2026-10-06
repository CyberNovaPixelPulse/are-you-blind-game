import { isQuestionId } from "@/lib/seen-questions";
import { supabase } from "@/lib/supabase";

export function recordQuestionView(questionId: string) {
  if (!isQuestionId(questionId)) return;
  void supabase.rpc("increment_question_views", { target_question_id: questionId });
}
