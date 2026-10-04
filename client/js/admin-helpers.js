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
