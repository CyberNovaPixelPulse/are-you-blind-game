import { test, expect } from '@playwright/test';
import { installFixtures } from './fixtures';

test('ordinary player retries the locked answer and skips unavailable questions without losing streak', async ({ page }) => {
  await installFixtures(page);
  let calls = 0;
  const submitted: string[] = [];
  await page.route('**/api/questions/answer', async route => {
    calls++;
    const body = route.request().postDataJSON();
    submitted.push(body.optionId);
    if (calls === 1) await route.fulfill({ status: 503, json: { error: 'temporary' } });
    else if (calls === 2) await route.fulfill({ json: { questionId: body.questionId, optionId: body.optionId, correctOptionId: body.optionId, isCorrect: true } });
    else await route.fulfill({ status: 404, json: { code: 'question_unavailable', error: '題目無法判定' } });
  });
  await page.goto('/play');
  await page.getByRole('button', { name: '正確選項', exact: true }).click();
  await expect(page.getByRole('button', { name: '錯誤選項', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '重試答案', exact: true }).click();
  await expect(page.getByText('連勝 1', { exact: false })).toBeVisible();
  expect(submitted).toEqual(['correct', 'correct']);
  await page.getByRole('button', { name: '下一題', exact: true }).click();
  await page.getByRole('button', { name: '錯誤選項', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: '題目無法判定' })).toBeVisible();
  await expect(page.getByRole('button', { name: '重試答案', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '略過此題', exact: true }).click();
  await expect(page.getByRole('button', { name: '正確選項', exact: true })).toBeEnabled();
  await expect(page.getByText('連勝 1', { exact: false })).toBeVisible();
});

test('wrong verdict reveals the correct option by ID and resets streak once', async ({ page }) => {
  await installFixtures(page);
  await page.addInitScript(() => sessionStorage.setItem('quiz-streak', '2'));
  await page.goto('/play');
  await expect(page.getByText('連勝 2', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: '錯誤選項', exact: true }).click();
  await expect(page.getByText('正解', { exact: true })).toBeVisible();
  await expect(page.getByText('連勝 0', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: '正確選項 正解', exact: true })).toBeDisabled();
});

test('adopted verdict survives history failure, while failed grading never writes history', async ({ page }) => {
  await installFixtures(page);
  await page.addInitScript(() => {
    localStorage.setItem('sb-127-auth-token', JSON.stringify({
      access_token: 'fixture-token', refresh_token: 'fixture-refresh', expires_at: 4102444800,
      token_type: 'bearer', user: { id: '00000000-0000-0000-0000-000000000099', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' },
    }));
  });
  let writes = 0;
  let requests = 0;
  await page.route('**/rest/v1/user_question_answers*', async route => {
    writes++;
    await route.fulfill({ status: 400, json: { message: 'fixture storage failure' } });
  });
  await page.route('**/api/questions/answer', async route => {
    requests++;
    if (requests === 1) return route.fulfill({ status: 503, json: {} });
    const body = route.request().postDataJSON();
    await route.fulfill({ json: { questionId: body.questionId, optionId: body.optionId, correctOptionId: body.optionId, isCorrect: true } });
  });
  await page.goto('/play');
  await page.getByRole('button', { name: '正確選項', exact: true }).click();
  await expect(page.getByRole('button', { name: '重試答案', exact: true })).toBeVisible();
  expect(writes).toBe(0);
  await page.getByRole('button', { name: '重試答案', exact: true }).click();
  await expect(page.getByText('連勝 1', { exact: false })).toBeVisible();
  await expect.poll(() => writes).toBe(1);
  await expect(page.getByRole('button', { name: '下一題', exact: true })).toBeVisible();
  expect(requests).toBe(2);
});

test('same-task clicks cannot replace the answer used by an explicit retry', async ({ page }) => {
  await installFixtures(page);
  const submitted: string[] = [];
  await page.route('**/api/questions/answer', async route => {
    const body = route.request().postDataJSON();
    submitted.push(body.optionId);
    if (submitted.length === 1) await route.fulfill({ status: 503, json: {} });
    else await route.fulfill({ json: { ...body, correctOptionId: 'correct', isCorrect: true } });
  });
  await page.goto('/play');
  await expect(page.getByRole('button', { name: '正確選項', exact: true })).toBeEnabled();
  await page.evaluate(() => {
    const buttons = [...document.querySelectorAll('button')];
    buttons.find(b => b.textContent?.trim() === '正確選項')!.click();
    buttons.find(b => b.textContent?.trim() === '錯誤選項')!.click();
  });
  await page.getByRole('button', { name: '重試答案', exact: true }).click();
  await expect(page.getByText('連勝 1', { exact: false })).toBeVisible();
  expect(submitted).toEqual(['correct', 'correct']);
});
