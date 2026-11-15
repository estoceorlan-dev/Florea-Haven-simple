import { readFileSync } from 'node:fs';
import { URL as NodeURL } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./common.js', () => ({ pageReady: Promise.resolve(true) }));
vi.mock('./purchase.js', () => ({
  enablePurchases: vi.fn(),
  isStaffOrAdminUser: () => false,
  openPurchase: vi.fn(),
}));
vi.mock('./api.js', () => ({
  catalogApi: {
    getCategories: vi.fn(),
    getProducts: vi.fn(),
    getProduct: vi.fn(),
  },
}));
vi.mock('./helpers.js', async (importOriginal) => ({
  ...(await importOriginal()),
  watchAvailability: vi.fn(),
}));

import { catalogApi } from './api.js';
import { watchAvailability } from './helpers.js';

const product = {
  id: 'bouquet',
  name: 'Garden bouquet',
  category: { name: 'Flowers', slug: 'flowers' },
  price: 500,
  description: 'Fresh flowers',
  sku: 'FLOWER-1',
  stock_quantity: 10,
  image_url: 'https://example.com/bouquet.jpg',
};

function openPage(file, path) {
  const html = readFileSync(new NodeURL(`../${file}`, import.meta.url), 'utf8');
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  document.body.replaceWith(parsed.body);
  history.replaceState(null, '', path);
}

function pending() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

const skeletonFor = (id) => document.querySelector(`[data-loading-for="${id}"]`);

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  catalogApi.getCategories.mockResolvedValue({ data: [] });
  catalogApi.getProducts.mockResolvedValue({ data: [product] });
});

afterEach(() => document.body.replaceChildren());

describe('catalog skeleton lifecycle', () => {
  it('renders products while collection filters are still loading', async () => {
    openPage('pages/products.html', '/products');
    const categories = pending();
    catalogApi.getCategories.mockReturnValue(categories.promise);
    expect(skeletonFor('product-list').hidden).toBe(false);
    expect(document.querySelector('#product-list').hidden).toBe(true);

    const loading = import('./catalog.js');
    await vi.waitFor(() => expect(skeletonFor('product-list').hidden).toBe(true));
    expect(document.querySelector('#product-list').hidden).toBe(false);
    expect(document.querySelector('#product-list').textContent).toContain(product.name);
    expect(skeletonFor('category-filters').hidden).toBe(false);

    categories.resolve({ data: [] });
    await loading;
    expect(skeletonFor('category-filters').hidden).toBe(true);
    expect(document.querySelector('#category-filters').getAttribute('aria-busy')).toBe(
      'false',
    );
  });

  it('clears the skeleton and shows the empty state for an empty catalog', async () => {
    openPage('pages/products.html', '/products');
    catalogApi.getProducts.mockResolvedValue({ data: [] });
    await import('./catalog.js');
    expect(skeletonFor('product-list').hidden).toBe(true);
    expect(document.querySelector('#empty-state').hidden).toBe(false);
  });

  it('clears both home skeletons when requests fail and shows the error', async () => {
    openPage('index.html', '/');
    catalogApi.getProducts.mockRejectedValue(new Error('Catalog unavailable'));
    catalogApi.getCategories.mockRejectedValue(new Error('Collections unavailable'));
    await import('./catalog.js');
    expect(skeletonFor('product-list').hidden).toBe(true);
    expect(skeletonFor('category-list').hidden).toBe(true);
    expect(document.querySelector('#page-error').hidden).toBe(false);
  });

  it('keeps product content and controls hidden after a failed detail request', async () => {
    openPage('pages/product.html', '/products/bouquet');
    catalogApi.getProduct.mockRejectedValue(new Error('Product unavailable'));
    await import('./catalog.js');
    expect(skeletonFor('product-details').hidden).toBe(true);
    expect(document.querySelector('#product-details').hidden).toBe(true);
    expect(document.querySelector('#page-error').textContent).toBe(
      'Product unavailable',
    );
  });

  it('keeps loaded cards visible during a background availability refresh', async () => {
    openPage('pages/products.html', '/products');
    await import('./catalog.js');
    const response = pending();
    catalogApi.getProducts.mockReturnValue(response.promise);
    const refresh = watchAvailability.mock.calls[0][0]();
    expect(skeletonFor('product-list').hidden).toBe(true);
    expect(document.querySelector('#product-list').hidden).toBe(false);
    expect(document.querySelector('#product-list').textContent).toContain(product.name);
    response.resolve({ data: [product] });
    await refresh;
  });
});
