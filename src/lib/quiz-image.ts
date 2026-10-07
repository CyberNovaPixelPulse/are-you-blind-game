import { supabase } from "@/lib/supabase";

export function quizImageUrl(path: string): string {
  const value = path.trim();
  if (/^https?:\/\//i.test(value)) return value;
  return supabase.storage.from("quiz-images").getPublicUrl(value).data.publicUrl;
}
