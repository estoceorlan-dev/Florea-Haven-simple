const { test, expect } = require('@playwright/test');

test('page markup exists in HTML before JavaScript runs', async ({ browser }) => {
  const context = await browser.newContext({
    baseURL: 'http://127.0.0.1:4173',
    javaScriptEnabled: false,
  });
  try {
    const page = await context.newPage();
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /Let beauty/ })).toBeVisible();
    await page.goto('/login');
    await expect(page.getByLabel('Email address')).toBeVisible();
    await expect(page.getByLabel('Password', { exact: true })).toBeVisible();
    await page.goto('/register');
    await expect(page.getByLabel('Full name')).toBeVisible();
    const response = await context.request.get('/products');
    const html = await response.text();
    expect(html).toContain('The collection');
    expect(html).toContain('id="product-card-template"');
    expect(html).not.toContain('/src/main.js');
    expect(html).not.toContain('data-view=');
  } finally {
    await context.close();
  }
});
