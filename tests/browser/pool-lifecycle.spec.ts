import { test, expect } from '@playwright/test';
import { installFixtures, questions, switchLanguage } from './fixtures';

const batch = (items = questions, thinLanguage = false) => ({ questions: items, resetSeen: false, keepIds: [], error: '', thinLanguage });

test('language switches keep the current question and use the new language on next presentation', async ({ page }) => {
  await installFixtures(page, { draw: input => input.language === 'en' ? batch([questions[2]], true) : batch(questions.slice(0, 2)) });
  await page.goto('/play');
  await expect(page.getByRole('button', { name: '正確選項', exact: true })).toBeVisible();
  const current = await page.locator('header p').first().innerText();
  const english = page.waitForResponse(response => response.url().endsWith('/api/questions/random') && response.request().postDataJSON().language === 'en');
  await switchLanguage(page, 'en');
  await english;
  await expect(page.locator('header p').first()).toHaveText(current);
  await page.getByRole('button', { name: '正確選項', exact: true }).click();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.locator('header p').first()).toHaveText('Author 3');
});

test('ordinary play consumes buffered questions during failure and retries without losing streak', async ({ page }) => {
  let first = true;
  let recovered = false;
  await installFixtures(page, { draw: () => {
    if (first) { first = false; return batch(questions.slice(0, 2)); }
    return recovered ? batch([questions[2]]) : { ...batch([]), error: 'offline' };
  } });
  await page.goto('/play');
  for (let n = 1; n <= 2; n++) {
    await page.getByRole('button', { name: '正確選項', exact: true }).click();
    await expect(page.getByText(`連勝 ${n}`, { exact: false })).toBeVisible();
    await page.getByRole('button', { name: '下一題', exact: true }).click();
  }
  await expect(page.getByRole('alert').filter({ hasText: '題目載入失敗' })).toHaveText('題目載入失敗，請再試一次');
  await expect(page.getByText('連勝 2', { exact: false })).toBeVisible();
  recovered = true;
  await page.getByRole('button', { name: '再試一次', exact: true }).click();
  await expect(page.locator('header p').first()).toHaveText('Author 3');
  await expect(page.getByText('連勝 2', { exact: false })).toBeVisible();
});

test('challenge load failure after scoring pauses the clock and retries the next question without clearing', async ({ page }) => {
  let initial = true;
  let recovered = false;
  await installFixtures(page, { draw: () => {
    if (initial) { initial = false; return batch([questions[0]]); }
    return recovered ? batch([questions[1]]) : { ...batch([]), error: 'offline' };
  } });
  await page.goto('/challenge');
  await page.getByRole('button', { name: '開始挑戰', exact: true }).click();
  await page.getByRole('button', { name: '正確選項', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: '題目載入失敗' })).toBeVisible();
  await expect(page.locator('header')).toContainText('🔥 1');
  await expect(page.getByText('題庫被你刷完了', { exact: true })).toBeHidden();
  await expect(page.locator('header')).toContainText('10s');
  recovered = true;
  await page.getByRole('button', { name: '再試一次', exact: true }).click();
  await expect(page.getByRole('img', { name: '這題的特寫' })).toHaveAttribute('src', /fixture-1/);
  await expect(page.locator('header')).toContainText('🔥 1');
  await expect(page.getByRole('button', { name: '正確選項', exact: true })).toBeEnabled();
});

test('daily challenge retries acquisition, presents assigned order, and clears only after the list ends', async ({ page }) => {
  let randomUsed = false;
  await installFixtures(page, { draw: () => { randomUsed = true; return batch(); } });
  await page.route('**/api/challenge/daily-questions*', route => route.fulfill({ status: 503, json: { error: 'offline' } }));
  await page.goto('/challenge?daily=1');
  await page.getByRole('button', { name: '開始挑戰', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: '題目載入失敗' })).toBeVisible();
  await page.unroute('**/api/challenge/daily-questions*');
  await page.getByRole('button', { name: '再試一次', exact: true }).click();
  for (let index = 0; index < 3; index++) {
    await expect(page.getByRole('img', { name: '這題的特寫' })).toHaveAttribute('src', new RegExp(`fixture-${index}`));
    await page.getByRole('button', { name: '正確選項', exact: true }).click();
  }
  await expect(page.getByText('題庫被你刷完了', { exact: true })).toBeVisible();
  await expect(page.locator('header')).toContainText('🔥 3');
  expect(randomUsed).toBe(false);
});

test('challenge language switch retains current timer and changes the next question', async ({ page }) => {
  await installFixtures(page, { draw: input => input.language === 'en' ? batch([questions[2]], true) : batch(questions.slice(0, 2)) });
  await page.goto('/challenge');
  await page.getByRole('button', { name: '開始挑戰', exact: true }).click();
  await expect(page.getByRole('button', { name: '正確選項', exact: true })).toBeEnabled();
  const image = page.getByRole('img', { name: '這題的特寫' });
  const current = await image.getAttribute('src');
  const english = page.waitForResponse(response => response.url().endsWith('/api/questions/random') && response.request().postDataJSON().language === 'en');
  await switchLanguage(page, 'en');
  await english;
  await expect(image).toHaveAttribute('src', current!);
  await page.getByRole('button', { name: '正確選項', exact: true }).click();
  await expect(image).toHaveAttribute('src', /fixture-2/);
  await expect(page.locator('header')).toContainText('🔥 1');
});

test('challenge timeout, restart, and third-loss advertisement retain their round rules', async ({ page }) => {
  await installFixtures(page);
  await page.goto('/challenge');
  await page.getByRole('button', { name: '開始挑戰', exact: true }).click();
  await expect(page.getByRole('button', { name: '錯誤選項', exact: true })).toBeEnabled();
  await expect(page.getByRole('dialog', { name: '最終結算' })).toBeVisible({ timeout: 12000 });
  await expect(page.getByText('時間到', { exact: true })).toBeVisible();
  for (let game = 2; game <= 3; game++) {
    await page.getByRole('button', { name: '再挑戰一次', exact: true }).click();
    await page.getByRole('button', { name: '錯誤選項', exact: true }).click();
    await expect(page.getByRole('dialog', { name: '最終結算' })).toBeVisible();
  }
  await page.getByRole('button', { name: '再挑戰一次', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '贊助展示' })).toBeVisible();
  await expect(page.getByRole('dialog', { name: '贊助展示' })).toBeHidden({ timeout: 8000 });
  await expect(page.getByRole('button', { name: '正確選項', exact: true })).toBeEnabled();
});

test('switching language during an empty-buffer wait resumes with the new language', async ({ page }) => {
  let first = true;
  let finishOld!: (value: ReturnType<typeof batch>) => void;
  const old = new Promise<ReturnType<typeof batch>>(resolve => { finishOld = resolve; });
  await installFixtures(page, { draw: input => {
    if (input.language === 'en') return batch([questions[2]]);
    if (first) { first = false; return batch([questions[0]]); }
    return old;
  } });
  await page.goto('/play');
  await page.getByRole('button', { name: '正確選項', exact: true }).click();
  await page.getByRole('button', { name: '下一題', exact: true }).click();
  await expect(page.getByRole('button', { name: '正確選項', exact: true })).toBeHidden();
  await switchLanguage(page, 'en');
  await expect(page.locator('header p').first()).toHaveText('Author 3');
  finishOld(batch([questions[1]], true));
  await expect(page.locator('header p').first()).toHaveText('Author 3');
});

test('a timely challenge answer is scored at click time despite a delayed verdict', async ({ page }) => {
  await installFixtures(page, { answerDelayMs: 1600 });
  await page.goto('/challenge');
  await page.getByRole('button', { name: '開始挑戰', exact: true }).click();
  await expect(page.locator('header')).toContainText('1s', { timeout: 12000 });
  await page.getByRole('button', { name: '正確選項', exact: true }).click();
  await expect(page.locator('header')).toContainText('🔥 1', { timeout: 5000 });
  await expect(page.getByRole('dialog', { name: '最終結算' })).toBeHidden();
  await expect(page.getByRole('button', { name: '正確選項', exact: true })).toBeEnabled();
});

test('failed challenge verdict restores the remaining time and allows an answer retry', async ({ page }) => {
  await installFixtures(page, { answerDelayMs: 1200 });
  await page.route('**/api/questions/answer', async route => {
    await new Promise(resolve => setTimeout(resolve, 1200));
    await route.fulfill({ status: 503, json: { error: '判定暫時失敗' } });
  }, { times: 1 });
  await page.goto('/challenge');
  await page.getByRole('button', { name: '開始挑戰', exact: true }).click();
  await expect(page.locator('header')).toContainText('1s', { timeout: 12000 });
  await page.getByRole('button', { name: '正確選項', exact: true }).click();
  await expect(page.getByText('判定暫時失敗', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '正確選項', exact: true }).click();
  await expect(page.locator('header')).toContainText('🔥 1');
  await expect(page.getByRole('dialog', { name: '最終結算' })).toBeHidden();
});
