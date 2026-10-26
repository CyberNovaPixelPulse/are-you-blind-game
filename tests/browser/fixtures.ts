import type { Page } from '@playwright/test';
import { pickQuestions, type BatchDrawResult } from '../../src/lib/question-draw';

export const ids = ['00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000003'];
export const questions = ids.map((id, i) => ({
  id, crop_image_path: `fixture-${i}.png`, original_image_path: '', author_name: `Author ${i + 1}`,
  options: [{ id: 'correct', text: '正確選項' }, { id: 'wrong', text: '錯誤選項' }],
}));
type DrawInput = { seenIds: string[]; reservedIds: string[]; avoidId: string; count: number; language: string };
export const drawBatch = (input: DrawInput) => pickQuestions(questions, input.seenIds, [], input.avoidId, input.reservedIds, input.count);
export async function installFixtures(page: Page, controls: {
  draw?: (input: DrawInput) => BatchDrawResult | Promise<BatchDrawResult>;
  daily?: () => typeof questions | Promise<typeof questions>;
  answerDelayMs?: number;
} = {}) {
  await page.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === '/api/questions/random') {
      await route.fulfill({ json: await (controls.draw ?? drawBatch)(request.postDataJSON()) });
    } else if (url.pathname === '/api/challenge/daily-questions') {
      await route.fulfill({ json: { date: '2026-10-26', questions: await (controls.daily?.() ?? questions) } });
    } else if (url.pathname === '/api/questions/answer') {
      if (controls.answerDelayMs) await new Promise(resolve => setTimeout(resolve, controls.answerDelayMs));
      const correct = request.postDataJSON().optionId === 'correct';
      await route.fulfill({ json: { questionId: request.postDataJSON().questionId, optionId: request.postDataJSON().optionId, correctOptionId: 'correct', isCorrect: correct, answerText: '正確選項', tauntText: '再接再厲', originalImageUrl: '/fixture-original.png' } });
    } else if (url.pathname === '/api/challenge/score') {
      await route.fulfill({ json: { runId: 'fixture-run', mode: 'daily', challengeDate: '2026-10-26' } });
    } else if (url.pathname === '/api/questions/view') {
      await route.fulfill({ json: { ok: true } });
    } else if (url.pathname.includes('fixture-')) {
      await route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20" fill="green"/></svg>' });
    } else if (url.origin !== 'http://127.0.0.1:3103') {
      await route.abort();
    } else await route.continue();
  });
}
export async function switchLanguage(page: Page, language: string) {
  await page.evaluate(language => {
    localStorage.setItem('guess-meme-language', language);
    window.dispatchEvent(new Event('guess-meme-language'));
  }, language);
}
