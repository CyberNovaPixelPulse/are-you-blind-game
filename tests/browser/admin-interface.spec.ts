import { test, expect } from '@playwright/test';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { installFixtures } from './fixtures';

// Render the real board with synthetic props, without unlocking the real admin or writing data.
const fixtureDirectory = path.resolve('src/app/interface-review-fixture');
let ownsFixture = false;
test.beforeAll(async () => {
  await mkdir(fixtureDirectory);
  ownsFixture = true;
  await writeFile(path.join(fixtureDirectory, 'page.tsx'), `
    import { AdminBoard } from '@/app/admin/admin-board';
    import type { AdminQuestion } from '@/app/admin/types';
    const question: AdminQuestion = {
      id:'10000000-0000-0000-0000-000000000001',authorName:'Fixture',createdAt:'2026-01-01T00:00:00Z',
      cropUrl:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7p8AAAAASUVORK5CYII=',originalUrl:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7p8AAAAASUVORK5CYII=',cropPath:'fixture-crop.png',originalPath:'fixture-original.png',
      status:'active',hideReason:null,difficulty:'normal',language:'zh-TW',reports:[],solvabilityScore:80,category:'fixture',qualityScore:80,scoreBreakdown:{},
      options:[{id:'correct',text:'樣本正解',isCorrect:true,tauntText:'樣本評語'},{id:'wrong',text:'樣本錯誤',isCorrect:false,tauntText:'樣本評語'}]
    };
    export default function Fixture(){return <AdminBoard questions={[question]} reportsUnavailable={false} serverWrites={false}/>;}
  `, { flag: 'wx' });
});
test.afterAll(async () => { if (ownsFixture) await rm(fixtureDirectory, { recursive: true }); });

test('admin filters survive reload and can be shared by URL', async ({ page }) => {
  await installFixtures(page); await page.goto('/interface-review-fixture');
  await page.getByRole('combobox', { name: '狀態', exact: true }).selectOption('hidden');
  await expect(page.getByText('沒有符合這個篩選的題目。', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('combobox', { name: '狀態', exact: true })).toHaveValue('hidden');
  await expect(page).toHaveURL(/status=hidden/);
});

test('admin editing has visible focus, labels and nested confirmation focus restoration', async ({ page }) => {
  await installFixtures(page);
  await page.goto('/interface-review-fixture');
  const email = page.getByLabel('作者 Email', { exact: true });
  await email.focus();
  expect(await email.evaluate(node => getComputedStyle(node).outlineStyle)).not.toBe('none');
  await page.getByRole('button', { name: /樣本正解 的特寫/ }).click();
  const review = page.getByRole('dialog', { name: '樣本正解', exact: true });
  await expect(review.getByRole('button', { name: /編輯內容/ })).toBeFocused();
  await review.getByRole('button', { name: /編輯內容/ }).click();
  await expect(review.getByRole('combobox', { name: '難度', exact: true })).toBeVisible();
  const correct = review.getByLabel('正解名稱', { exact: true });
  await correct.fill('修改後的樣本');
  expect(await page.getByRole('dialog', { name: '修改後的樣本', exact: true }).getByLabel('正解名稱', { exact: true }).evaluate(node => getComputedStyle(node).outlineStyle)).not.toBe('none');
  await page.getByRole('dialog', { name: '修改後的樣本', exact: true }).getByRole('button', { name: '關閉彈窗', exact: true }).click();
  const unsaved = page.getByRole('dialog', { name: '尚未儲存', exact: true });
  const keep = unsaved.getByRole('button', { name: '繼續編輯', exact: true });
  await expect(keep).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(unsaved.getByRole('button', { name: '確定退出', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(unsaved).toBeHidden();
  await expect(page.getByRole('dialog', { name: '修改後的樣本', exact: true }).getByRole('button', { name: '關閉彈窗', exact: true })).toBeFocused();
  await page.screenshot({ path: '/tmp/guess-meme-admin-interface.png', fullPage: true });
});
