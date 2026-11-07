import { adminCatalogApi } from './api.js';
import { pageReady, showPage } from './common.js';
import {
  find,
  fillText,
  copyTemplate,
  showError,
  showNotice,
  formValues,
  setBusy,
  confirmAction,
} from './helpers.js';
import { fillForm, setupAdminModal } from './admin-helpers.js';

if (await pageReady) {
  const form = find('#category-form');
  const modalError = find('[data-modal-error]', form);
  const categories = new Map();
  let selected = null;
  let busy = false;
  const modal = setupAdminModal('category-modal', () => {
    edit();
    modal.close();
  });
  function closeModal() {
    edit();
    modal.close();
  }
  function edit(category = null) {
    selected = category;
    showError(null, modalError);
    fillForm(form, {
      name: category?.name ?? '',
      slug: category?.slug ?? '',
      description: category?.description ?? '',
    });
    fillText(form, {
      'form-eyebrow': category ? 'Edit category' : 'New category',
      'form-title': category ? 'Edit collection' : 'Add a collection',
    });
    find('[data-save-category]', form).textContent = category
      ? 'Save category'
      : 'Create category';
  }
  async function load() {
    const result = await adminCatalogApi.getCategories();
    fillText(document, { 'category-count': `${result.data.length} categories` });
    find('#admin-category-list').replaceChildren(
      ...result.data.map((category) => {
        categories.set(category.id, category);
        const row = copyTemplate('category-row-template');
        row.dataset.categoryId = category.id;
        fillText(row, {
          name: category.name,
          slug: category.slug,
          description: category.description,
          'product-count': `${category.active_product_count} active / ${category.product_count} total`,
        });
        find('[data-edit-category]', row).setAttribute(
          'aria-label',
          `Edit ${category.name}`,
        );
        find('[data-delete-category]', row).setAttribute(
          'aria-label',
          `Delete ${category.name}`,
        );
        return row;
      }),
    );
  }
  find('[data-new-category]')?.addEventListener('click', (event) => {
    edit();
    modal.open(event.currentTarget);
  });
  find('[data-cancel-editing]', form).addEventListener('click', closeModal);
  find('#admin-category-list').addEventListener('click', (event) => {
    const button = event.target.closest('[data-edit-category], [data-delete-category]');
    if (!button) return;
    const category = categories.get(
      button.closest('[data-category-id]').dataset.categoryId,
    );
    if (button.hasAttribute('data-edit-category')) {
      edit(category);
      modal.open(button);
      return;
    }
    confirmAction({
      title: `Delete ${category.name}?`,
      description: 'Collections referenced by products are protected from deletion.',
      label: 'Delete category',
      trigger: button,
      action: async () => {
        await adminCatalogApi.deleteCategory(category.id);
        showNotice(`${category.name} was deleted.`);
        if (selected?.id === category.id) closeModal();
        await load();
      },
    });
  });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy) return;
    busy = true;
    setBusy(form, true);
    showError(null);
    showError(null, modalError);
    try {
      const wasEditing = Boolean(selected);
      const result = selected
        ? await adminCatalogApi.updateCategory(selected.id, formValues(form))
        : await adminCatalogApi.createCategory(formValues(form));
      showNotice(`${result.data.name} was ${wasEditing ? 'updated' : 'created'}.`);
      closeModal();
      await load();
    } catch (error) {
      showError(error, modalError);
    } finally {
      busy = false;
      setBusy(form, false);
    }
  });
  try {
    await load();
  } catch (error) {
    showError(error);
  }
  showPage();
}
