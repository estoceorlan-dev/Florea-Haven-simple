import { afterEach, describe, expect, it } from 'vitest';
import { copyTemplate, fillText, safeReturnPath } from './helpers.js';

afterEach(() => document.body.replaceChildren());

describe('plain HTML data updates', () => {
  it('treats API content as text while preserving existing form controls', () => {
    const section = document.createElement('section');
    const name = document.createElement('p');
    name.dataset.field = 'name';
    const input = document.createElement('input');
    input.value = 'Saved delivery address';
    section.append(name, input);
    document.body.append(section);
    input.focus();
    fillText(section, { name: '<img src=x onerror=alert(1)>' });
    expect(name.textContent).toBe('<img src=x onerror=alert(1)>');
    expect(section.querySelector('img')).toBeNull();
    expect(input.value).toBe('Saved delivery address');
    expect(document.activeElement).toBe(input);
  });

  it('clones the real HTML template without modifying the original', () => {
    const template = document.createElement('template');
    template.id = 'product-card-template';
    const article = document.createElement('article');
    article.dataset.field = 'name';
    article.textContent = 'Product name';
    template.content.append(article);
    document.body.append(template);
    const first = copyTemplate(template.id);
    const second = copyTemplate(template.id);
    first.textContent = 'Garden bouquet';
    expect(second.textContent).toBe('Product name');
    expect(template.content.firstElementChild.textContent).toBe('Product name');
  });

  it('rejects external login return paths, including backslash URL tricks', () => {
    expect(safeReturnPath('/products/bouquet?buy=1')).toBe('/products/bouquet?buy=1');
    expect(safeReturnPath('//example.com')).toBeNull();
    expect(safeReturnPath('/\\example.com')).toBeNull();
    expect(safeReturnPath('https://example.com')).toBeNull();
  });
});
