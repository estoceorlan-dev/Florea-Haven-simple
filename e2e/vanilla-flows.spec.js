const { test, expect } = require('@playwright/test');

const fillAddress = async (page) => {
  await page.getByLabel('Phone number').fill('09171234567');
  await page.getByLabel('Address line 1').fill('12 Garden Street');
  await page.getByLabel('City', { exact: true }).fill('Tagbilaran');
  await page.getByLabel('Province').fill('Bohol');
  await page.getByLabel('Postal code').fill('6300');
};
const customer = async (page, project, prefix) => {
  const result = await page.request.post('/api/auth/register', {
    data: {
      name: 'Vanilla Shopper',
      email: prefix + '-' + project + '-' + Date.now() + '@e2e.test',
      password: 'Garden123',
    },
  });
  expect(result.status()).toBe(201);
};

test('administrator creates, edits, removes categories and restores products', async ({
  page,
}, testInfo) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.request.post('/api/auth/login', {
    data: { email: 'admin@e2e.test', password: 'E2eGarden123' },
  });
  const suffix = testInfo.project.name + '-' + Date.now();
  const category = 'Seasonal ' + suffix;
  const renamed = 'Seasonal revised ' + suffix;
  await page.goto('/admin/categories');
  await page.getByLabel('Category name', { exact: true }).fill(category);
  await page.getByLabel('Description', { exact: true }).fill('A seasonal collection.');
  await page.getByRole('button', { name: 'Create category', exact: true }).click();
  await expect(page.getByText(category + ' was created.')).toBeVisible();
  await page.goto('/');
  await expect(page.getByRole('link', { name: new RegExp(category) })).toBeVisible();
  await page.goto('/admin/categories');
  await page.getByRole('button', { name: 'Edit ' + category, exact: true }).click();
  await page.getByLabel('Category name', { exact: true }).fill(renamed);
  await page.getByRole('button', { name: 'Save category', exact: true }).click();
  await expect(page.getByText(renamed + ' was updated.')).toBeVisible();
  await page.getByRole('button', { name: 'Delete ' + renamed, exact: true }).click();
  await page.getByRole('button', { name: 'Delete category', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Edit ' + renamed, exact: true }),
  ).toHaveCount(0);

  await page.goto('/admin/products');
  const form = page.locator('form').filter({
    has: page.getByRole('heading', { name: 'Add to the garden', exact: true }),
  });
  const name = 'Vanilla Bouquet ' + suffix;
  await form.getByLabel('Product name', { exact: true }).fill(name);
  await form.getByLabel('SKU', { exact: true }).fill('VANILLA-' + suffix);
  await form
    .getByRole('combobox', { name: 'Category', exact: true })
    .selectOption({ label: 'Flowers' });
  await form.getByLabel('Price (PHP)', { exact: true }).fill('125');
  await form.getByLabel(/^Stock quantity/).fill('3');
  await form
    .getByLabel('Description', { exact: true })
    .fill('A fresh botanical arrangement.');
  await form.getByRole('button', { name: 'Create product', exact: true }).click();
  await expect(page.getByText(name + ' was created.')).toBeVisible();
  await page.getByRole('button', { name: 'Edit ' + name, exact: true }).click();
  await page.getByLabel(/^Stock quantity/).fill('4');
  await page.getByRole('button', { name: 'Save product', exact: true }).click();
  await expect(page.getByText(name + ' was updated.')).toBeVisible();
  await page.getByRole('button', { name: 'Deactivate ' + name, exact: true }).click();
  await page.getByRole('button', { name: 'Deactivate product', exact: true }).click();
  await expect(page.getByText(name + ' was deactivated.')).toBeVisible();
  await page.getByRole('button', { name: 'Restore ' + name, exact: true }).click();
  await expect(page.getByText(name + ' is active again.')).toBeVisible();
  expect(errors).toEqual([]);
});

test('cart quantities, checkout conflicts and saved delivery details survive native updates', async ({
  page,
  browser,
}, testInfo) => {
  await customer(page, testInfo.project.name, 'cart-native');
  await page.goto('/products');
  await page
    .getByRole('button', { name: 'Add Blush Garden Bouquet to cart', exact: true })
    .click();
  await page.goto('/cart');
  await page
    .getByRole('button', {
      name: 'Increase Blush Garden Bouquet quantity',
      exact: true,
    })
    .click();
  await expect(page.getByLabel('Quantity', { exact: true })).toHaveText('2');
  await page.getByRole('link', { name: /checkout/i }).click();
  await fillAddress(page);
  const admin = await browser.newContext({ baseURL: 'http://127.0.0.1:4173' });
  try {
    await admin.request.post('/api/auth/login', {
      data: { email: 'admin@e2e.test', password: 'E2eGarden123' },
    });
    const payload = await (
      await admin.request.get('/api/products?search=Blush')
    ).json();
    const product = payload.data.find((item) => item.name === 'Blush Garden Bouquet');
    const originalStock = product.stock_quantity;
    const response = await admin.request.put('/api/products/' + product.id, {
      data: { stockQuantity: 1 },
    });
    expect(response.status()).toBe(200);
    await page.getByRole('button', { name: 'Place order', exact: true }).click();
    await expect(page.getByRole('alert').first()).toContainText(
      /availability changed/i,
    );
    await expect(page.getByLabel('Address line 1')).toHaveValue('12 Garden Street');
    await expect(page.getByLabel('Phone number')).toHaveValue('09171234567');
    await expect(page).toHaveURL('/checkout');
    await admin.request.put('/api/products/' + product.id, {
      data: { stockQuantity: originalStock },
    });
    await page.goto('/cart');
    await page
      .getByRole('button', {
        name: 'Remove',
        exact: true,
      })
      .click();
    await expect(
      page.getByRole('heading', { name: 'Room for something lovely.', exact: true }),
    ).toBeVisible();
  } finally {
    await admin.close();
  }
});

test('buy-now retries retain the delivery form and idempotency key', async ({
  page,
}, testInfo) => {
  await customer(page, testInfo.project.name, 'retry-native');
  await page.goto('/products');
  await page.getByRole('button', { name: 'Buy now', exact: true }).first().click();
  await page.getByRole('button', { name: 'Continue to checkout', exact: true }).click();
  await fillAddress(page);
  const keys = [];
  await page.route('**/api/orders/buy-now', async (route) => {
    keys.push(route.request().headers()['idempotency-key']);
    if (keys.length === 1) await route.abort('failed');
    else await route.continue();
  });
  await page.getByRole('button', { name: 'Place order', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('We could not reach the garden');
  await expect(page.getByLabel('Address line 1')).toHaveValue('12 Garden Street');
  await page.getByRole('button', { name: 'Place order', exact: true }).click();
  await expect(page).toHaveURL(/\/orders\/[^/]+\/confirmation/);
  expect(keys).toHaveLength(2);
  expect(keys[0]).toBeTruthy();
  expect(keys[1]).toBe(keys[0]);
});

test('cart checkout can retry a committed order after its response is lost', async ({
  page,
}, testInfo) => {
  await page.clock.install();
  await customer(page, testInfo.project.name, 'retry-cart');
  await page.goto('/products');
  await page
    .locator('.product-card')
    .first()
    .getByRole('button', { name: /^Add .+ to cart$/ })
    .click();
  await expect(
    page.getByRole('link', { name: 'Shopping cart with 1 items' }),
  ).toBeVisible();
  await page.goto('/checkout');
  await fillAddress(page);
  const keys = [];
  let committedOrder;
  await page.route('**/api/orders', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    keys.push(route.request().headers()['idempotency-key']);
    if (keys.length === 1) {
      const response = await route.fetch();
      expect(response.status()).toBe(201);
      committedOrder = (await response.json()).data.order;
      await route.abort('failed');
    } else await route.continue();
  });
  await page.getByRole('button', { name: 'Place order', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('We could not reach the garden');
  // Advance past an availability refresh: it must retain the form for the retry.
  await page.clock.fastForward(11000);
  await expect(page.getByLabel('Address line 1')).toHaveValue('12 Garden Street');
  await page.getByRole('button', { name: 'Place order', exact: true }).click();
  await expect(page).toHaveURL(`/orders/${committedOrder.id}/confirmation`);
  expect(keys).toHaveLength(2);
  expect(keys[1]).toBe(keys[0]);
  const orders = (await (await page.request.get('/api/orders')).json()).data;
  expect(orders).toHaveLength(1);
});
