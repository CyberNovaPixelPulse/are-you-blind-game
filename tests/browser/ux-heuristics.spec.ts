import { test, expect } from '@playwright/test';
import { installFixtures, questions } from './fixtures';
import { pickQuestions } from '../../src/lib/question-draw';

test('leaderboard keeps keyboard focus inside and restores its trigger on Escape', async ({ page }) => {
  await installFixtures(page);
  await page.goto('/');
  const trigger = page.getByRole('button', { name: '排行榜', exact: true });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: '全服天梯榜' });
  const close = dialog.getByRole('button', { name: '關閉', exact: true });
  await expect(close).toBeFocused();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await expect(close).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Shift+Tab');
  await expect(close).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});

test('long answer options stay fully readable and reachable on a short mobile screen', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 480 });
  const longAnswer = '這是一段需要完整閱讀才能辨識答案的長選項文字，請保留每一個關鍵字而不要省略內容。';
  const longQuestions = questions.map(question => ({
    ...question,
    options: question.options.map(option => ({ ...option, text: longAnswer + option.text })),
  }));
  await installFixtures(page, { draw: input => pickQuestions(longQuestions, input.seenIds, [], input.avoidId, input.reservedIds, input.count) });
  await page.goto('/play');
  const correct = page.getByRole('button', { name: longAnswer + '正確選項', exact: true });
  await expect(correct).toBeVisible();
  const text = correct.getByText(longAnswer + '正確選項', { exact: true });
  expect(await text.evaluate(element => element.scrollWidth <= element.clientWidth && element.scrollHeight <= element.clientHeight)).toBe(true);
  await correct.scrollIntoViewIfNeeded();
  await correct.click();
  const next = page.getByRole('button', { name: '下一題', exact: true });
  await next.scrollIntoViewIfNeeded();
  await expect(next).toBeInViewport();
});

test('answer submission announces its pending state and prevents duplicate guesses', async ({ page }) => {
  await installFixtures(page, { answerDelayMs: 1200 });
  await page.goto('/play');
  const correct = page.getByRole('button', { name: '正確選項', exact: true });
  await correct.click();
  await expect(page.getByRole('status')).toHaveText('正在確認答案…');
  await expect(correct).toBeDisabled();
  await expect(page.getByRole('button', { name: '錯誤選項', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: '下一題', exact: true })).toBeVisible();
  await expect(page.getByText('正在確認答案…')).toBeHidden();
});

test('a guest can start guessing from the primary action before account prompts', async ({ page }) => {
  await installFixtures(page);
  await page.goto('/');
  const start = page.getByRole('link', { name: '立即猜圖', exact: true });
  await expect(start).toBeVisible();
  await expect(page.getByText('免登入，直接開始玩', { exact: true })).toBeVisible();
  await page.screenshot({ path: '/tmp/guess-meme-ux-home.png', fullPage: true });
  expect(await start.evaluate(element => {
    const honor = document.querySelector('section h2');
    return Boolean(honor && (element.compareDocumentPosition(honor) & Node.DOCUMENT_POSITION_FOLLOWING));
  })).toBe(true);
  await start.click();
  await expect(page.getByRole('button', { name: '正確選項', exact: true })).toBeEnabled();
});

for (const locale of [
  { option: 'English', start: 'Start guessing', daily: 'Daily ten', checking: 'Checking your answer…', back: 'Back to Home', dir: 'ltr' },
  { option: 'العربية', start: 'ابدأ التخمين', daily: 'عشرة أسئلة يوميًا', checking: 'جارٍ التحقق من إجابتك…', back: 'العودة للرئيسية', dir: 'rtl' },
]) {
  test(`guest entry and answer status work in ${locale.option} on mobile`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 480 });
    await installFixtures(page, { answerDelayMs: 1200 });
    await page.goto('/');
    await page.getByRole('button', { name: '繁體中文', exact: true }).click();
    await page.getByRole('option').filter({ hasText: locale.option }).click();
    await expect(page.locator('html')).toHaveAttribute('dir', locale.dir);
    await expect(page.getByRole('heading', { name: locale.daily, exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.getByRole('link', { name: locale.start, exact: true }).click();
    await expect(page.getByRole('link', { name: locale.back, exact: true })).toBeVisible();
    await page.getByRole('button', { name: '正確選項', exact: true }).click();
    await expect(page.getByRole('status')).toHaveText(locale.checking);
  });
}
