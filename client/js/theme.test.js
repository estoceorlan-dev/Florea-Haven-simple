import { afterEach, describe, expect, it } from 'vitest';
import {
  applyThemeToDocument,
  getStoredThemePreference,
  persistThemePreference,
  resolveTheme,
} from './theme.js';

afterEach(() => localStorage.clear());

describe('website appearance', () => {
  it('stores a valid preference and resolves system appearance', () => {
    expect(getStoredThemePreference()).toBe('system');
    expect(persistThemePreference('dark')).toBe(true);
    expect(getStoredThemePreference()).toBe('dark');
    expect(persistThemePreference('invalid')).toBe(false);
    expect(resolveTheme('system', 'dark')).toBe('dark');
    expect(resolveTheme('light', 'dark')).toBe('light');
  });

  it('updates the document and browser color together', () => {
    const meta = document.createElement('meta');
    meta.name = 'theme-color';
    document.head.append(meta);
    applyThemeToDocument('dark', 'dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(document.documentElement.style.colorScheme).toBe('dark');
    expect(meta.content).toBe('#211820');
    meta.remove();
  });
});
