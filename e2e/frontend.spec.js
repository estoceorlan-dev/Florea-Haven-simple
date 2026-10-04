const { test, expect } = require('@playwright/test');
const path = require('node:path');
const fs = require('node:fs');

const image = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aY1cAAAAASUVORK5CYII=',
  'base64',
);
async function capture(page, testInfo, name) {
  if (!process.env.E2E_CAPTURE_DIR) return;
  fs.mkdirSync(process.env.E2E_CAPTURE_DIR, { recursive: true });
  await page.waitForLoadState('networkidle');
  await page.screenshot({
    path: path.join(
      process.env.E2E_CAPTURE_DIR,
      testInfo.project.name + '-' + name + '.png',
    ),
    fullPage: true,
  });
}

test('storefront routes, filters, keyboard menus and theme preferences', async ({
  page,
}, testInfo) => {
  if (process.env.E2E_CAPTURE_DIR) test.setTimeout(120000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('https://images.unsplash.com/**', (route) =>
    route.fulfill({ contentType: 'image/png', body: image }),
  );
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const theme of ['light', 'dark']) {
    await page.addInitScript(
      (value) => localStorage.setItem('florea-theme-preference', value),
      theme,
    );
    await page.goto('/');
    await expect(page.locator('.product-card')).toHaveCount(4);
    await capture(page, testInfo, theme + '-home');
    await page.goto('/products');
    await expect(page.locator('.product-card').first()).toBeVisible();
    await capture(page, testInfo, theme + '-catalog');
    await page
      .getByRole('link', { name: 'View Blush Garden Bouquet', exact: true })
      .click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Blush Garden Bouquet',
    );
    await capture(page, testInfo, theme + '-product');
    await page.goto('/login');
    await expect(page.getByLabel('Email address')).toBeVisible();
    await capture(page, testInfo, theme + '-login');
    await page.goto('/register');
    await expect(page.getByLabel('Full name')).toBeVisible();
    await capture(page, testInfo, theme + '-register');
  }
  await page.goto('/products');
  await page
    .getByRole('searchbox', { name: 'Search products', exact: true })
    .fill('Zinnia');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page).toHaveURL(/search=Zinnia/);
  await expect(page.locator('.product-card')).toHaveCount(1);
  await page.getByRole('combobox', { name: 'Sort products' }).focus();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/sort=name-asc/);
  await page.goBack();
  await expect(
    page.getByRole('searchbox', { name: 'Search products', exact: true }),
  ).toHaveValue('Zinnia');
  await page.goto('/products');
  const filters = page.locator('[data-toggle-filters]');
  if (await filters.isVisible()) await filters.click();
  await page.locator('#category-filters a[href="/products?category=perfumes"]').click();
  await expect(page).toHaveURL(/category=perfumes/);
  await expect(page.locator('.product-card')).toHaveCount(3);
  await expect(page.locator('#category-filters [aria-current=page]')).toContainText(
    'Perfumes',
  );
  await page.goto('/account');
  await expect(page).toHaveURL('/login');
  await page.goto('/missing-page');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  expect(errors).toEqual([]);
});

test('administrator pages retain their layouts and role protection', async ({
  page,
}, testInfo) => {
  if (process.env.E2E_CAPTURE_DIR) test.setTimeout(120000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('https://images.unsplash.com/**', (route) =>
    route.fulfill({ contentType: 'image/png', body: image }),
  );
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const response = await page.request.post('/api/auth/login', {
    data: { email: 'admin@e2e.test', password: 'E2eGarden123' },
  });
  expect(response.status()).toBe(200);
  for (const theme of ['light', 'dark']) {
    await page.addInitScript(
      (value) => localStorage.setItem('florea-theme-preference', value),
      theme,
    );
    for (const section of ['', 'products', 'categories', 'orders', 'users']) {
      await page.goto('/admin' + (section ? '/' + section : ''));
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await capture(page, testInfo, theme + '-admin-' + (section || 'dashboard'));
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      ).toBe(true);
    }
  }
  expect(errors).toEqual([]);
});
