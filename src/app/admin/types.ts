import type { QuizOption } from "@/lib/question-options";

export type AdminReport = {
  id: string;
  reason: string;
  details: string;
  createdAt: string;
};

export type AdminQuestion = {
  id: string;
  authorName: string;
  createdAt: string;
  cropUrl: string;
  originalUrl: string;
  cropPath: string;
  originalPath: string;
  status: string;
  difficulty: string;
  language: string;
  options: QuizOption[];
  reports: AdminReport[];
  solvabilityScore: number;
  category: string;
  qualityScore: number | null;
  scoreBreakdown: Record<string, unknown>;
};
