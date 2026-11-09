import { questions } from './questions.js';
export const STORAGE_KEY = 'dfs-dominando-v3';
export function countAnswered(answers) {
  return questions.filter((q) => Number.isInteger(answers[q.id]) && answers[q.id] >= 0 && answers[q.id] < q.options.length).length;
}
export function scoreQuiz(answers) {
  return questions.filter((q) => answers[q.id] === q.correct).length;
}
export function restoreProgress(raw) {
  try {
    const value = JSON.parse(raw);
    if (!value || typeof value.answers !== 'object' || !value.answers) return null;
    const answers = {};
    for (const q of questions) {
      const a = value.answers[q.id];
      if (Number.isInteger(a) && a >= 0 && a < q.options.length) answers[q.id] = a;
    }
    return { answers, index: Number.isInteger(value.index) && value.index >= 0 && value.index < questions.length ? value.index : 0, finished: value.finished === true && countAnswered(answers) === questions.length };
  } catch { return null; }
}
