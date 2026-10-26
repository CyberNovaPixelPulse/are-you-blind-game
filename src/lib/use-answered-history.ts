"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { supabase } from "@/lib/supabase";
import { createAnsweredHistory } from "@/lib/answered-history";

/** Lifetime is this mounted player page, never a durable offline queue. */
export function useAnsweredHistory() {
  const [history] = useState(() => createAnsweredHistory({
    write: async (userId, questionId, signal) => {
      const result = await supabase.from("user_question_answers").upsert({
        user_id: userId, question_id: questionId,
      }, { onConflict: "user_id,question_id", ignoreDuplicates: true }).retry(false).abortSignal(signal);
      if (result.error) throw result.error;
    },
  }));
  const unsyncedCount = useSyncExternalStore(history.subscribe, history.getUnsyncedCount, () => 0);
  useEffect(() => {
    let active = true;
    let authVersion = 0;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      authVersion++;
      history.setPlayer(session?.user.id ?? null);
    });
    const version = authVersion;
    void supabase.auth.getSession().then(({ data }) => {
      if (active && authVersion === version) history.setPlayer(data.session?.user.id ?? null);
    });
    return () => { active = false; subscription.unsubscribe(); history.dispose(); };
  }, [history]);
  return { captureAnswered: history.capture, unsyncedCount };
}
