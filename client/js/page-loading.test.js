import { readFileSync } from 'node:fs';
import { URL as NodeURL } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./api.js', () => ({
  authApi: { getMe: vi.fn() },
  cartApi: { getCart: vi.fn() },
  adminOrderApi: { getOrders: vi.fn() },
  orderApi: { getOrders: vi.fn() },
}));

import { authApi } from './api.js';

function openPage(file) {
  const html = readFileSync(new NodeURL(`../${file}`, import.meta.url), 'utf8');
  document.body.replaceWith(new DOMParser().parseFromString(html, 'text/html').body);
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  document.body.replaceChildren();
});

describe('protected page skeletons', () => {
  it('keeps the dashboard skeleton until its controller finishes loading data', async () => {
    openPage('admin/index.html');
    authApi.getMe.mockResolvedValue({
      data: { user: { id: 'admin', name: 'Garden Admin', role: 'admin' } },
    });
    const { pageReady, showPage } = await import('./common.js');
    expect(await pageReady).toBe(true);
    const skeleton = document.querySelector('[data-loading-for="main-content"]');
    expect(skeleton.hidden).toBe(false);
    expect(document.querySelector('main').hidden).toBe(true);
    showPage();
    expect(skeleton.hidden).toBe(true);
    expect(document.querySelector('main').hidden).toBe(false);
    expect(document.querySelector('main').getAttribute('aria-busy')).toBe('false');
  });

  it('clears a protected page skeleton and reveals the error if session loading fails', async () => {
    openPage('pages/cart.html');
    authApi.getMe.mockRejectedValue(new Error('Connection unavailable'));
    const { pageReady } = await import('./common.js');
    expect(await pageReady).toBe(false);
    expect(document.querySelector('[data-loading-for="main-content"]').hidden).toBe(
      true,
    );
    expect(document.querySelector('main').hidden).toBe(false);
    expect(document.querySelector('#page-error').textContent).toBe(
      'Connection unavailable',
    );
  });
});
