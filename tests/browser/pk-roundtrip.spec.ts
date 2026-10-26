import { test, expect, type Page } from '@playwright/test';
import { installFixtures, ids, questions } from './fixtures';

const playerId = '00000000-0000-0000-0000-000000000099';
async function setupPk(page: Page) {
  await installFixtures(page);
  await page.addInitScript(playerId => {
    localStorage.setItem('sb-127-auth-token', JSON.stringify({ access_token: 'fixture-token', refresh_token: 'fixture-refresh', expires_at: 4102444800, token_type: 'bearer', user: { id: playerId, aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' } }));
  }, playerId);
  await page.route('**/rest/v1/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path.endsWith('/pk_rooms')) await route.fulfill({ json: { id: 'room1', room_code: 'ABCD', host_id: 'other', mode: 'private', status: 'playing', max_players: 2, question_ids: ids, started_at: '2026-01-01T00:00:00Z' } });
    else if (path.endsWith('/pk_participants')) await route.fulfill({ json: [{ room_id: 'room1', user_id: playerId, username: 'You', avatar_url: null, joined_at: '2026-01-01T00:00:00Z', is_bot: false, current_question: 0, total_score: 0 }] });
    else if (path.endsWith('/questions')) await route.fulfill({ json: questions });
    else await route.fulfill({ status: 204 });
  });
}

test('PK locks the first option, retries explicitly and excludes network latency from score', async ({ page }) => {
  await setupPk(page);
  let grading = 0;
  const inputs: string[] = [];
  await page.route('**/api/questions/answer', async route => {
    grading++;
    const body = route.request().postDataJSON(); inputs.push(body.optionId);
    await new Promise(resolve => setTimeout(resolve, 1000));
    if (grading === 1) await route.fulfill({ status: 503, json: {} });
    else await route.fulfill({ json: { ...body, correctOptionId: 'correct', isCorrect: true } });
  });
  await page.goto('/pk/ABCD');
  await page.getByRole('button', { name: '正確選項', exact: true }).click();
  await expect(page.getByRole('button', { name: '錯誤選項', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '重試答案', exact: true }).click();
  await expect(page.getByText('Author 2', { exact: true })).toBeVisible();
  expect(inputs).toEqual(['correct', 'correct']);
  // A near-immediate choice scores almost 3000 even after two 1s network waits.
  await expect(page.getByText(/^(29\d\d|3000)$/).first()).toBeVisible();
});

test('PK unavailable verdict stops local play without advancing or submitting fabricated progress', async ({ page }) => {
  await setupPk(page);
  let saves = 0;
  await page.route('**/rest/v1/pk_participants*', async route => {
    if (route.request().method() === 'PATCH') saves++;
    await route.fulfill({ json: [{ room_id: 'room1', user_id: playerId, username: 'You', joined_at: '2026-01-01T00:00:00Z', is_bot: false, current_question: 0, total_score: 0 }] });
  });
  await page.route('**/api/questions/answer', async route => route.fulfill({ status: 409, json: { code: 'question_unavailable', error: '此題無法判定' } }));
  await page.goto('/pk/ABCD');
  await page.getByRole('button', { name: '正確選項', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: '此題無法判定' })).toBeVisible();
  await expect(page.getByRole('button', { name: '離開房間', exact: true })).toBeVisible();
  await expect(page.getByText('Author 1', { exact: true })).toBeVisible();
  expect(saves).toBe(0);
});

test('leaving PK while a verdict is pending discards its score and history effects', async ({ page }) => {
  await setupPk(page);
  let release!: () => void;
  let entered!: () => void;
  const requested = new Promise<void>(resolve => { entered = resolve; });
  const held = new Promise<void>(resolve => { release = resolve; });
  let saves = 0;
  let history = 0;
  await page.route('**/rest/v1/pk_participants*', async route => {
    if (route.request().method() === 'PATCH') saves++;
    await route.fulfill({ json: [{ room_id: 'room1', user_id: playerId, username: 'You', joined_at: '2026-01-01T00:00:00Z', is_bot: false, current_question: 0, total_score: 0 }] });
  });
  await page.route('**/rest/v1/user_question_answers*', async route => { history++; await route.fulfill({ status: 204 }); });
  await page.route('**/api/questions/answer', async route => {
    const body = route.request().postDataJSON(); entered(); await held;
    await route.fulfill({ json: { ...body, correctOptionId: 'correct', isCorrect: true } }).catch(() => {});
  });
  await page.goto('/pk/ABCD');
  await page.getByRole('button', { name: '正確選項', exact: true }).click();
  await requested;
  await page.getByRole('button', { name: '回到大廳', exact: true }).click();
  await expect(page).toHaveURL(/\/pk$/);
  release();
  await expect(page.getByText('PK 猜題', { exact: true })).toHaveCount(0);
  expect(saves).toBe(0); expect(history).toBe(0);
});

test('slow lobby navigation cannot allow the already scheduled next question to advance', async ({ page }) => {
  await setupPk(page);
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/pk?*', async route => { await held; await route.continue(); });
  await page.goto('/pk/ABCD');
  await page.getByRole('button', { name: '正確選項', exact: true }).click();
  await expect(page.getByRole('button', { name: '正確選項', exact: true })).toBeDisabled();
  await expect(page.getByText(/^(29\d\d|3000)$/).first()).toBeVisible();
  await page.getByRole('button', { name: '回到大廳', exact: true }).click();
  // The normal 600ms advance must stay cancelled while the 100ms display clock rerenders.
  await page.waitForTimeout(900);
  await expect(page.getByText('Author 1', { exact: true })).toBeVisible();
  await expect(page.getByText('Author 2', { exact: true })).toHaveCount(0);
  release();
  await expect(page).toHaveURL(/\/pk$/);
});
