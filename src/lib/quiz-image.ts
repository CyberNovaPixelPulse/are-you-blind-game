import { supabase } from "@/lib/supabase";

export function quizImageUrl(path: string): string {
  const value = path.trim();
  if (/^https?:\/\//i.test(value)) return value;
  return supabase.storage.from("quiz-images").getPublicUrl(value).data.publicUrl;
}

export function quizImageObjectPath(value: string): string {
  const trimmed = value.trim();
  const marker = "/quiz-images/";
  const index = trimmed.indexOf(marker);
  if (!/^https?:\/\//i.test(trimmed) || index === -1) return trimmed;
  return decodeURIComponent(trimmed.slice(index + marker.length).split("?")[0]);
}
