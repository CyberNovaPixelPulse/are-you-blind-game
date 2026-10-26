"use client";

import { useSyncExternalStore } from "react";
import { isLanguageCode, type LanguageCode } from "@/lib/languages";
import { isDifficulty, type Difficulty } from "@/lib/question-options";

const changed = "admin-board-filters";
const sorts = ["reports", "newest", "oldest", "score-desc", "score-asc"] as const;
type Sort = (typeof sorts)[number];
function subscribe(listener: () => void) {
  window.addEventListener("popstate", listener);
  window.addEventListener(changed, listener);
  return () => { window.removeEventListener("popstate", listener); window.removeEventListener(changed, listener); };
}
const snapshot = () => window.location.search;

export function useBoardFilters() {
  const search = useSyncExternalStore(subscribe, snapshot, () => "");
  const params = new URLSearchParams(search);
  const sort = params.get("sort");
  const status = params.get("status");
  const difficulty = params.get("difficulty");
  const language = params.get("language");
  function update(key: string, value: string, fallback: string) {
    const url = new URL(window.location.href);
    if (value === fallback) url.searchParams.delete(key);
    else url.searchParams.set(key, value);
    // Replace only filters; repeated changes must not fill browser history.
    window.history.replaceState(null, "", url);
    window.dispatchEvent(new Event(changed));
  }
  return {
    sortKey: sorts.includes(sort as Sort) ? sort as Sort : "reports" as Sort,
    statusFilter: (status === "active" || status === "hidden" ? status : "all") as "all" | "active" | "hidden",
    difficultyFilter: (isDifficulty(difficulty ?? "") ? difficulty : "all") as Difficulty | "all",
    languageFilter: isLanguageCode(language ?? "") ? language as LanguageCode : "all",
    setSortKey: (value: Sort) => update("sort", value, "reports"),
    setStatusFilter: (value: "all" | "active" | "hidden") => update("status", value, "all"),
    setDifficultyFilter: (value: "all" | Difficulty) => update("difficulty", value, "all"),
    setLanguageFilter: (value: "all" | LanguageCode) => update("language", value, "all"),
  };
}
