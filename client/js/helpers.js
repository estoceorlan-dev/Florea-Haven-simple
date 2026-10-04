import { formatCurrency, formatDateTime } from './currency.js';

export { formatCurrency as currency, formatDateTime as dateTime };

// These helpers use ordinary DOM methods. They never build HTML strings.
export const find = (selector, root = document) => root.querySelector(selector);
export const findAll = (selector, root = document) => [
  ...root.querySelectorAll(selector),
];

export function fillText(root, values) {
  for (const [name, value] of Object.entries(values)) {
    for (const element of findAll(`[data-field="${name}"]`, root)) {
      element.textContent = value ?? '';
    }
  }
}

export function copyTemplate(id) {
  const template = document.getElementById(id);
  if (!template) throw new Error(`The HTML template "${id}" is missing.`);
  return template.content.firstElementChild.cloneNode(true);
}

export function formValues(form) {
  return Object.fromEntries(new FormData(form));
}

export function updatePagination(pagination) {
  const panel = find('#pagination');
  if (!panel) return;
  panel.hidden = !pagination || pagination.totalPages <= 1;
  if (!pagination) return;
  fillText(document, {
    'page-summary': `Page ${pagination.page} of ${pagination.totalPages} · ${pagination.total} results`,
  });
  for (const [selector, page] of [
    ['[data-previous-page]', pagination.page - 1],
    ['[data-next-page]', pagination.page + 1],
  ]) {
    const link = find(selector, panel);
    const query = new URLSearchParams(location.search);
    query.set('page', page);
    link.href = location.pathname + '?' + query;
    link.hidden = page < 1 || page > pagination.totalPages;
  }
}

export function safeReturnPath(value) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//'))
    return null;
  try {
    const url = new URL(value, location.origin);
    return url.origin === location.origin ? url.pathname + url.search + url.hash : null;
  } catch {
    return null;
  }
}

export function errorMessage(error) {
  return error?.details?.[0]?.message ?? error?.message ?? 'Please try again.';
}

export function showError(error, element = find('#page-error')) {
  if (!element) return;
  element.textContent = error ? errorMessage(error) : '';
  element.hidden = !error;
}

export function showNotice(message) {
  const element = find('#page-notice');
  if (!element) return;
  element.textContent = message;
  element.hidden = !message;
}

export function setBusy(form, busy) {
  form.setAttribute('aria-busy', String(busy));
  const submit = find('[type="submit"]', form);
  if (submit) submit.disabled = busy;
}

export function setImage(image, url, alt = '') {
  if (!image) return;
  image.alt = alt;
  const valid = typeof url === 'string' && /^https?:\/\//i.test(url);
  image.src = valid ? url : '/image-placeholder.svg';
  image.onerror = () => {
    image.onerror = null;
    image.src = '/image-placeholder.svg';
  };
}

export function updateStock(root, quantity, requested = 1) {
  const low = quantity > 0 && quantity <= 5;
  const unavailable = quantity <= 0 || requested > quantity;
  const label =
    quantity <= 0
      ? 'Out of stock'
      : requested > quantity
        ? `Only ${quantity} available`
        : low
          ? `Only ${quantity} left`
          : `${quantity} in stock`;
  for (const element of findAll('[data-stock]', root)) {
    element.dataset.stockState = unavailable
      ? 'unavailable'
      : low
        ? 'low'
        : 'available';
    fillText(element, { stock: label });
    const time = find('[data-stock-time]', element);
    if (time) {
      const now = new Date();
      time.dateTime = now.toISOString();
      time.textContent =
        '· ' + now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    }
  }
  return unavailable;
}

export function watchAvailability(refresh, interval = 30000) {
  const run = () => {
    if (!document.hidden) void refresh();
  };
  const timer = setInterval(run, interval);
  window.addEventListener('focus', run);
  window.addEventListener('online', run);
  window.addEventListener(
    'pagehide',
    () => {
      clearInterval(timer);
      window.removeEventListener('focus', run);
      window.removeEventListener('online', run);
    },
    { once: true },
  );
}

// All overlay markup comes from a <template> in the current HTML document.
export function openOverlay(templateId, trigger) {
  const root = copyTemplate(templateId);
  document.body.append(root);
  const panel = find('[aria-modal="true"]', root) ?? root;
  const previousOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
  const focusable = () =>
    findAll(
      'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]',
      panel,
    ).filter((element) => !element.closest('[hidden]'));
  function close() {
    document.removeEventListener('keydown', onKey);
    document.body.style.overflow = previousOverflow;
    root.remove();
    trigger?.setAttribute('aria-expanded', 'false');
    trigger?.focus();
  }
  function onKey(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
    }
    if (event.key !== 'Tab') return;
    const elements = focusable();
    const first = elements[0],
      last = elements.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  }
  document.addEventListener('keydown', onKey);
  for (const button of findAll('[data-close-overlay]', root))
    button.addEventListener('click', close);
  (find('[data-drawer-autofocus]', root) ?? focusable()[0])?.focus();
  return { root, close };
}

export function confirmAction({ title, description, label, trigger, action }) {
  const overlay = openOverlay('confirmation-template', trigger);
  find('[data-confirm-title]', overlay.root).textContent = title;
  find('[data-confirm-description]', overlay.root).textContent = description;
  const button = find('[data-confirm-action]', overlay.root);
  button.textContent = label;
  button.addEventListener('click', async () => {
    button.disabled = true;
    try {
      await action();
      overlay.close();
    } catch (error) {
      showError(error);
      button.disabled = false;
    }
  });
}
