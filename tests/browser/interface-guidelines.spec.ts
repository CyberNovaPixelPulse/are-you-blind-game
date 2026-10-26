import { test, expect, type Page, type Locator } from '@playwright/test';
import { installFixtures, questions } from './fixtures';
import { pickQuestions } from '../../src/lib/question-draw';
import sharp from 'sharp';

async function wheelTo(page: Page, control: Locator) {
  await page.mouse.move(160, 350);
  await expect.poll(async () => {
    await page.mouse.wheel(0, 600);
    return control.evaluate(node => { const rect = node.getBoundingClientRect(); return rect.top >= 0 && rect.bottom <= innerHeight; });
  }).toBe(true);
  await expect(control).toBeInViewport({ ratio: 0.9 });
}

async function signedIn(page: Page) {
  const user = { id: '10000000-0000-0000-0000-000000000001', email: 'fixture@example.test', user_metadata: { name: '測試玩家' }, aud: 'authenticated', role: 'authenticated', created_at: '2026-01-01T00:00:00Z' };
  await page.addInitScript(user => localStorage.setItem('sb-127-auth-token', JSON.stringify({ access_token: 'fixture-token', refresh_token: 'fixture', token_type: 'bearer', expires_at: 4102444800, user })), user);
  await page.route('**/rest/v1/**', route => route.fulfill({ json: [] }));
}

test('language picker supports arrow keys, Home, End and Escape with focus restoration', async ({ page }) => {
  await installFixtures(page);
  await page.goto('/');
  const trigger = page.getByRole('button', { name: '繁體中文', exact: true });
  await trigger.click();
  await expect(page.getByRole('option', { selected: true })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('option').nth(1)).toBeFocused();
  await page.keyboard.press('End');
  await expect(page.getByRole('option').last()).toBeFocused();
  await page.keyboard.press('Home');
  await expect(page.getByRole('option').first()).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
});

test('challenge long answers remain reachable on a short screen', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 480 });
  const long = '必須完整閱讀的選項文字，包含多個重要線索，請仔細辨認圖片中的細節。'.repeat(2);
  const source = questions.map(q => ({ ...q, options: Array.from({ length: 4 }, (_, i) => ({ id: i === 0 ? 'correct' : `wrong-${i}`, text: `${i + 1} ${long}` })) }));
  await installFixtures(page, { draw: input => pickQuestions(source, input.seenIds, [], input.avoidId, input.reservedIds, input.count) });
  await page.goto('/challenge');
  await page.getByRole('button', { name: '開始挑戰', exact: true }).click();
  const last = page.getByRole('button').filter({ hasText: long }).last();
  await expect(last).toBeVisible();
  await wheelTo(page, last);
});

test('nested report dialog is labeled, traps focus and restores the result dialog', async ({ page }) => {
  await installFixtures(page);
  await page.goto('/play');
  await page.getByRole('button', { name: '錯誤選項', exact: true }).click();
  const result = page.getByRole('dialog', { name: '答錯了', exact: true });
  const trigger = result.getByRole('button', { name: /回報糾錯/ });
  await trigger.click();
  const report = page.getByRole('dialog', { name: '回報這題', exact: true });
  await expect(report.getByRole('button', { name: '正解有爭議', exact: true })).toBeFocused();
  await expect(report.getByRole('textbox', { name: '補充說明（選填）', exact: true })).toBeVisible();
  await page.keyboard.press('Shift+Tab');
  await expect(report.getByRole('button', { name: '取消', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(report).toBeHidden();
  await expect(trigger).toBeFocused();
  await expect(result).toBeVisible();
});

test('profile dialog traps keyboard focus and profile navigation is a link', async ({ page }) => {
  await installFixtures(page); await signedIn(page);
  await page.goto('/');
  const trigger = page.getByRole('button', { name: /測試玩家/ });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: '個人設定', exact: true });
  await expect(dialog.getByRole('button', { name: '關閉', exact: true })).toBeFocused();
  await expect(dialog.getByRole('link', { name: /我出的題目/ })).toHaveAttribute('href', '/profile');
  await page.keyboard.press('Shift+Tab');
  await expect(dialog.getByRole('button', { name: '登出', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
});

test('reduced motion disables streak pulse and answer celebrations', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => sessionStorage.setItem('quiz-streak', '3'));
  await installFixtures(page);
  await page.goto('/play');
  const streak = page.getByText('連勝 3', { exact: false });
  await expect(streak).toBeVisible();
  expect(await streak.evaluate(element => getComputedStyle(element).animationName)).toBe('none');
  await page.getByRole('button', { name: '正確選項', exact: true }).click();
  await expect(page.getByText('答對了！', { exact: true })).toBeVisible();
  await expect(page.locator('canvas')).toHaveCount(0);
});

test('password mismatch focuses and describes the confirmation input', async ({ page }) => {
  await installFixtures(page); await signedIn(page);
  await page.goto('/reset-password');
  await page.getByLabel('新密碼', { exact: true }).fill('fixture-pass');
  const confirmation = page.getByLabel('再次輸入新密碼', { exact: true });
  await confirmation.fill('different-pass');
  await page.getByRole('button', { name: '儲存新密碼', exact: true }).click();
  await expect(confirmation).toBeFocused();
  await expect(confirmation).toHaveAttribute('aria-invalid', 'true');
  await expect(confirmation).toHaveAccessibleDescription('兩次輸入的密碼不一致。');
});

test('advertisement fits 320px and temporarily isolates the game', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 480 });
  await installFixtures(page);
  await page.goto('/play');
  for (let i = 0; i < 15; i++) {
    await page.getByRole('button', { name: '正確選項', exact: true }).click();
    await page.getByRole('button', { name: '下一題', exact: true }).click();
  }
  const ad = page.getByRole('dialog', { name: '贊助展示', exact: true });
  await expect(ad).toBeVisible();
  expect(await ad.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
  expect(await ad.locator('ins').evaluate(node => node.getBoundingClientRect().right <= window.innerWidth)).toBe(true);
  await expect(ad).toBeFocused();
});

test('PK long answers remain reachable by scrolling on a short screen', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 480 });
  await installFixtures(page); await signedIn(page);
  const long = '請讀完整段文字辨認物件，不同的選項有不同線索。'.repeat(3);
  await page.route('**/rest/v1/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/pk_rooms')) await route.fulfill({ json: { id: 'room1', room_code: 'ABCD', host_id: 'other', mode: 'private', status: 'playing', max_players: 2, question_ids: questions.map(q => q.id), started_at: '2026-01-01T00:00:00Z' } });
    else if (path.endsWith('/pk_participants')) await route.fulfill({ json: [{ room_id: 'room1', user_id: '10000000-0000-0000-0000-000000000001', username: 'You', joined_at: '2026-01-01T00:00:00Z', is_bot: false, current_question: 0, total_score: 0 }] });
    else if (path.endsWith('/questions')) await route.fulfill({ json: questions.map(q => ({ ...q, options: Array.from({ length: 4 }, (_, i) => ({ id: String(i), text: `${i + 1} ${long}` })) })) });
    else await route.fulfill({ status: 204 });
  });
  await page.goto('/pk/ABCD');
  const last = page.getByRole('button').filter({ hasText: long }).last();
  await expect(last).toBeVisible();
  await wheelTo(page, last);
  await page.screenshot({ path: '/tmp/guess-meme-pk-wheel.png' });
});

test('leaving an edited quiz asks before discarding its text', async ({ page }) => {
  await installFixtures(page);
  await page.goto('/create');
  await page.getByLabel('選項文字', { exact: true }).first().fill('尚未儲存的選項');
  let prompted = false;
  page.once('dialog', async dialog => { prompted = true; await dialog.dismiss(); });
  await page.getByRole('link', { name: '返回首頁', exact: true }).click();
  await expect(page).toHaveURL(/\/create$/);
  expect(prompted).toBe(true);
  await expect(page.getByLabel('選項文字', { exact: true }).first()).toHaveValue('尚未儲存的選項');
});

test('dark theme also applies to native controls', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await installFixtures(page); await page.goto('/create');
  expect(await page.locator('html').evaluate(node => getComputedStyle(node).colorScheme)).toBe('dark');
});

test('quiz validation focuses the first invalid field and file control has visible focus', async ({ page }) => {
  await installFixtures(page); await page.goto('/create');
  const author = page.getByLabel('作者名稱', { exact: true });
  await expect(author).toHaveValue('匿名出題者');
  await author.fill('');
  await page.getByRole('button', { name: '發布題目', exact: true }).click();
  await expect(author).toBeFocused();
  await expect(author).toHaveAttribute('aria-invalid', 'true');
  await expect(author).toHaveAccessibleDescription(/名稱/);
  const file = page.locator('input[type=file]');
  await file.focus();
  expect(await file.evaluate(node => getComputedStyle(node.closest('label')!).outlineStyle)).not.toBe('none');
});

test('VIP radio focus is visible without changing consent or charging', async ({ page }) => {
  await installFixtures(page); await signedIn(page); await page.goto('/pk');
  await page.getByRole('button').filter({ hasText: '創建好友房' }).click();
  const dialog = page.getByRole('dialog', { name: /升級 VIP/ });
  const radio = dialog.getByRole('radio').first();
  await expect(radio).toBeFocused();
  expect(await radio.evaluate(node => getComputedStyle(node.closest('label')!).outlineStyle)).not.toBe('none');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});

test('skip link focuses the main landmark without changing the resting homepage', async ({ page }) => {
  await installFixtures(page); await page.goto('/');
  await expect(page.getByRole('button', { name: '使用 Google 登入', exact: true })).toBeVisible();
  await page.screenshot({ path: '/tmp/guess-meme-guidelines-home.png', fullPage: true });
  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: '跳至主要內容', exact: true });
  await expect(skip).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('main')).toBeFocused();
});

test('long moderation feedback scrolls to its recovery action on a short screen', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 480 });
  await installFixtures(page); await signedIn(page);
  const detail = '請改善圖片與選項的辨識線索。'.repeat(35);
  const slice = (max: number) => ({ score: 0, max, detail });
  await page.route('**/api/questions/publication', route => route.fulfill({ json: { state: 'pending' } }));
  await page.route('**/api/moderate-quiz', route => route.fulfill({ json: { passed: false, quality_score: 0,
    guesses: ['甲', '乙', '丙'], score_breakdown: { blind_guess: { ...slice(40), level: 'normal', guesses: ['甲', '乙', '丙'] }, visual_richness: slice(25), distractor_deception: slice(20), safety: { ...slice(15), violated: false }, suggestion: detail }, suggestion: detail } }));
  await page.goto('/create');
  const image = await sharp({ create: { width: 400, height: 400, channels: 3, background: '#47966b' } }).png().toBuffer();
  await page.locator('input[type=file]').setInputFiles({ name: 'fixture.png', mimeType: 'image/png', buffer: image });
  for (let i = 0; i < 4; i++) {
    await page.getByLabel('選項文字', { exact: true }).nth(i).fill(`選項${i + 1}`);
    await page.getByLabel('專屬毒舌評語', { exact: true }).nth(i).fill('樣本評語');
  }
  await page.getByRole('button', { name: '發布題目', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '這題還沒通過預審', exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('heading', { name: '這題還沒通過預審', exact: true })).toBeInViewport();
  const recovery = dialog.getByRole('button', { name: '回去調整', exact: true });
  await wheelTo(page, recovery);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});
