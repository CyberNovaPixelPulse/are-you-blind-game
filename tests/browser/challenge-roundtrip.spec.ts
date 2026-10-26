import { test, expect } from '@playwright/test';
import { installFixtures, questions } from './fixtures';

test('an unavailable daily question interrupts without clearing or submitting a score', async ({ page }) => {
  await installFixtures(page, { daily: () => questions.slice(0, 2) });
  const finishes: unknown[] = [];
  await page.route('**/api/challenge/score', async route => {
    const body = route.request().postDataJSON();
    if (body.action === 'finish') finishes.push(body);
    await route.fulfill({ json: { runId: 'test-run', mode: 'daily', challengeDate: '2026-10-26' } });
  });
  await page.route('**/api/questions/answer', async route => {
    await route.fulfill({ status: 409, json: { code: 'question_unavailable', error: '此題缺少有效正解' } });
  });
  await page.goto('/challenge?daily=1');
  await page.getByRole('button', { name: '開始挑戰', exact: true }).click();
  await page.getByRole('button', { name: '正確選項', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '本次挑戰中斷' })).toBeVisible();
  await expect(page.getByText('本次成績不會提交排行榜。', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '再挑戰一次', exact: true })).toHaveCount(0);
  expect(finishes).toEqual([]);
});

test('challenge retry consumes waiting time but retains the first submission score', async ({ page }) => {
  await page.clock.install();
  await installFixtures(page);
  let calls = 0;
  const selected: string[] = [];
  await page.route('**/api/questions/answer', async route => {
    calls++;
    const body = route.request().postDataJSON(); selected.push(body.optionId);
    if (calls < 3) await route.fulfill({ status: 503, json: {} });
    else await route.fulfill({ json: { ...body, correctOptionId: 'correct', isCorrect: true } });
  });
  await page.goto('/challenge');
  await page.getByRole('button', { name: '開始挑戰', exact: true }).click();
  await expect(page.getByRole('button', { name: '正確選項', exact: true })).toBeEnabled();
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 100));
  await page.getByRole('button', { name: '正確選項', exact: true }).click();
  await expect(page.getByRole('button', { name: '重試答案', exact: true })).toBeVisible();
  const firstRemaining = Number(await page.getByRole('progressbar').getAttribute('aria-valuenow'));
  await page.clock.fastForward(2000);
  await page.getByRole('button', { name: '重試答案', exact: true }).click();
  await expect(page.getByRole('button', { name: '重試答案', exact: true })).toBeVisible();
  const laterRemaining = Number(await page.getByRole('progressbar').getAttribute('aria-valuenow'));
  expect(firstRemaining - laterRemaining).toBeGreaterThanOrEqual(1900);
  await page.getByRole('button', { name: '重試答案', exact: true }).click();
  await expect(page.locator('header')).toContainText('🔥 1');
  // Retry delay would reduce the score below 2700 if it replaced first timing.
  const summary = await page.locator('header').innerText();
  const points = Number(summary.match(/([\d,]+)\s*分/)?.[1].replaceAll(',', ''));
  expect(points).toBeGreaterThan(2700);
  expect(selected).toEqual(['correct', 'correct', 'correct']);
});
