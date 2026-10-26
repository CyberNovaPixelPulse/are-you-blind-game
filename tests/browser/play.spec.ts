import { test, expect } from '@playwright/test';
import { pickQuestions } from '../../src/lib/question-draw';

const ids = ['00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000003'];
const questions = ids.map((id, i) => ({
  id, crop_image_path: `fixture-${i}.png`, original_image_path: '', author_name: `Author ${i + 1}`,
  options: [{ id: 'correct', text: '正確選項', is_correct: true }, { id: 'wrong', text: '錯誤選項', is_correct: false }],
}));

test('ordinary play records only presented questions, cycles, and resumes after the fifteenth-question ad', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  // All external effects stop at HTTP boundaries; exercise the real page and draw policy.
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/questions/random') {
      const input = route.request().postDataJSON();
      await route.fulfill({ json: pickQuestions(questions, input.seenIds, [], input.avoidId, input.reservedIds, input.count) });
    } else if (url.pathname === '/api/questions/answer') {
      await route.fulfill({ json: { questionId: route.request().postDataJSON().questionId, optionId: 'correct', correctOptionId: 'correct', isCorrect: true, answerText: '正確選項', originalImageUrl: '/fixture-original.png' } });
    } else if (url.pathname === '/api/questions/view') {
      await route.fulfill({ json: { ok: true } });
    } else if (url.pathname.includes('fixture-')) {
      await route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20" fill="green"/></svg>' });
    } else if (url.origin !== 'http://127.0.0.1:3103') {
      await route.abort();
    } else {
      await route.continue();
    }
  });
  await page.goto('/play');
  await expect(page.getByRole('button', { name: '正確選項', exact: true })).toBeVisible();
  const seen = () => page.evaluate(() => JSON.parse(localStorage.getItem('seen_question_ids') || '[]') as string[]);
  let previous = await page.locator('header p').first().innerText();
  const displayedId = ids[Number(previous.replace('Author ', '')) - 1];
  expect(await seen()).toEqual([displayedId]);
  for (let i = 1; i <= 15; i++) {
    await page.getByRole('button', { name: '正確選項', exact: true }).click();
    await expect(page.getByText(`連勝 ${i}`, { exact: false })).toBeVisible();
    await page.getByRole('button', { name: '下一題', exact: true }).click();
    if (i === 15) {
      await expect(page.getByRole('dialog', { name: '贊助展示' })).toBeVisible();
      await expect(page.getByRole('dialog', { name: '贊助展示' })).toBeHidden({ timeout: 8000 });
    }
    await expect(page.getByRole('button', { name: '正確選項', exact: true })).toBeEnabled();
    const author = await page.locator('header p').first().innerText();
    expect(author).not.toBe(previous);
    previous = author;
  }
  await page.screenshot({ path: '/tmp/guess-meme-issue3-play.png' });
  expect(errors).toEqual([]);
});
