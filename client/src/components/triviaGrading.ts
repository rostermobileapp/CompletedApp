import type { TriviaToday } from "./triviaVisibility";

export type LocalTriviaResult = {
  date: string;
  chosen_index: number;
  is_correct: boolean;
  correct_index: number;
  explanation: string;
};

/** Display-only grading; never use this result to award progress or patches. */
export function gradeTriviaChoice(today: TriviaToday, chosenIndex: number): LocalTriviaResult {
  const correctIndex = today.correct_index;
  if (!Number.isInteger(correctIndex) || correctIndex === undefined ||
      correctIndex < 0 || correctIndex >= today.choices.length ||
      typeof today.explanation !== "string" || !today.explanation.trim()) {
    throw new Error("Today's answer details couldn't load. Reload the question and try again.");
  }
  if (!Number.isInteger(chosenIndex) || chosenIndex < 0 || chosenIndex >= today.choices.length) {
    throw new Error("Choose one of today's answers.");
  }
  return {
    date: today.date,
    chosen_index: chosenIndex,
    is_correct: chosenIndex === correctIndex,
    correct_index: correctIndex,
    explanation: today.explanation,
  };
}