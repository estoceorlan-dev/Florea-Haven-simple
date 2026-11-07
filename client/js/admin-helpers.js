import { find, findAll, formValues } from './helpers.js';

export { updatePagination } from './helpers.js';

export function enableFilters() {
  const form = find('#filter-form');
  const parameters = new URLSearchParams(location.search);
  for (const input of findAll('input,select', form))
    if (parameters.has(input.name)) input.value = parameters.get(input.name);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const query = new URLSearchParams();
    for (const [name, value] of Object.entries(formValues(form)))
      if (value && value !== 'all') query.set(name, value);
    location.assign(location.pathname + (query.size ? '?' + query : ''));
  });
  find('[data-clear-filters]', form)?.addEventListener('click', () =>
    location.assign(location.pathname),
  );
}

export function fillForm(form, values) {
  for (const [name, value] of Object.entries(values)) {
    const input = form.elements.namedItem(name);
    if (!input) continue;
    if (input.type === 'checkbox') input.checked = Boolean(value);
    else input.value = value ?? '';
  }
}

export function fillCategories(select, categories, includeAll = false) {
  const value = select.value;
  const options = categories.map((category) => new Option(category.name, category.id));
  if (includeAll) options.unshift(new Option('All categories', ''));
  select.replaceChildren(...options);
  if (options.some((option) => option.value === value)) select.value = value;
}

export function setupAdminModal(modalId, onCancel) {
  const root = find(`#${modalId}`);
  const panel = find('[role="dialog"]', root);
  let triggerElement = null;
  let previousOverflow = '';

  const focusable = () =>
    findAll(
      'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]',
      panel,
    ).filter((element) => !element.closest('[hidden]'));

  function onKey(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      if (onCancel) onCancel();
      else close();
      return;
    }
    if (event.key !== 'Tab') return;
    const elements = focusable();
    const first = elements[0];
    const last = elements.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  }

  function open(trigger = document.activeElement) {
    if (root.hidden) {
      triggerElement = trigger;
      previousOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      root.hidden = false;
      document.addEventListener('keydown', onKey);
    }
    const firstInput =
      find(
        'input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled])',
        panel,
      ) ?? focusable()[0];
    firstInput?.focus();
  }

  function close() {
    if (root.hidden) return;
    document.removeEventListener('keydown', onKey);
    document.body.style.overflow = previousOverflow;
    root.hidden = true;
    if (triggerElement && document.contains(triggerElement)) {
      triggerElement.focus();
    }
    triggerElement = null;
  }

  for (const button of findAll('[data-close-modal]', root)) {
    button.addEventListener('click', () => {
      if (onCancel) onCancel();
      else close();
    });
  }

  return { root, open, close };
}
