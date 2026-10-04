import { adminCatalogApi } from './api.js';
import { pageReady, showPage } from './common.js';
import {
  find,
  fillText,
  copyTemplate,
  currency,
  setImage,
  showError,
  showNotice,
  formValues,
  setBusy,
  confirmAction,
  watchAvailability,
} from './helpers.js';
import {
  enableFilters,
  fillForm,
  fillCategories,
  updatePagination,
} from './admin-helpers.js';
import { enableUpload } from './upload.js';

if (await pageReady) {
  const form = find('#product-form');
  const rows = new Map();
  let selected = null;
  let categories = [];
  let busy = false;
  enableFilters();
  function edit(product = null) {
    selected = product;
    fillForm(
      form,
      product
        ? {
            name: product.name,
            sku: product.sku,
            slug: product.slug,
            description: product.description,
            categoryId: product.category.id,
            price: product.price,
            stockQuantity: product.stock_quantity,
            featured: product.featured,
            isActive: product.is_active,
          }
        : {
            name: '',
            sku: '',
            slug: '',
            description: '',
            categoryId: categories[0]?.id,
            price: '',
            stockQuantity: 0,
            featured: false,
            isActive: true,
          },
    );
    fillText(form, {
      'form-title': product?.name ?? 'Add to the garden',
      'form-eyebrow': product ? 'Edit product' : 'New product',
    });
    find('[data-save-product]', form).textContent = product
      ? 'Save product'
      : 'Create product';
    find('[data-cancel-editing]', form).hidden = !product;
    find('[data-edit-only]', form).hidden = !product;
    const uploader = find('#product-upload');
    uploader.hidden = !product;
    if (product)
      enableUpload(
        uploader,
        `/api/products/${product.id}/image`,
        product.image_url,
        (result) => {
          selected = result.data.product ?? result.data;
          void load();
        },
      );
  }
  async function load() {
    if (busy) return;
    try {
      const result = await adminCatalogApi.getProducts({
        ...Object.fromEntries(new URLSearchParams(location.search)),
        limit: 20,
      });
      find('#admin-product-list').replaceChildren(
        ...result.data.map((product) => {
          rows.set(product.id, product);
          const row = copyTemplate('admin-product-template');
          row.dataset.productId = product.id;
          fillText(row, {
            name: product.name,
            'product-description': `${product.sku} · ${product.category.name}`,
            price: currency(product.price),
            stock: product.stock_quantity,
            'active-status': product.is_active ? 'Active' : 'Inactive',
          });
          setImage(find('img', row), product.image_url, '');
          find('[data-edit-product]', row).setAttribute(
            'aria-label',
            `Edit ${product.name}`,
          );
          const toggle = find('[data-toggle-product]', row);
          toggle.setAttribute(
            'aria-label',
            `${product.is_active ? 'Deactivate' : 'Restore'} ${product.name}`,
          );
          toggle.title = product.is_active ? 'Deactivate product' : 'Restore product';
          row.classList.toggle('opacity-60', !product.is_active);
          find('[data-field=active-status]', row).dataset.active = product.is_active;
          return row;
        }),
      );
      find('#empty-state').hidden = result.data.length !== 0;
      updatePagination(result.pagination);
    } catch (error) {
      showError(error);
    }
  }
  find('[data-new-product]')?.addEventListener('click', () => {
    edit();
    form.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
  find('[data-cancel-editing]', form).addEventListener('click', () => edit());
  find('#admin-product-list').addEventListener('click', (event) => {
    const button = event.target.closest('[data-edit-product], [data-toggle-product]');
    if (!button) return;
    const product = rows.get(button.closest('[data-product-id]').dataset.productId);
    if (button.hasAttribute('data-edit-product')) {
      edit(product);
      form.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    async function change() {
      if (product.is_active) await adminCatalogApi.deactivateProduct(product.id);
      else await adminCatalogApi.updateProduct(product.id, { isActive: true });
      showNotice(
        product.is_active
          ? `${product.name} was deactivated.`
          : `${product.name} is active again.`,
      );
      if (selected?.id === product.id) edit();
      await load();
    }
    if (product.is_active)
      confirmAction({
        title: `Deactivate ${product.name}?`,
        description:
          'It will leave the storefront. Existing order history is preserved.',
        label: 'Deactivate product',
        trigger: button,
        action: change,
      });
    else void change().catch(showError);
  });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy) return;
    const values = formValues(form);
    const input = {
      name: values.name,
      sku: values.sku,
      slug: values.slug,
      description: values.description,
      categoryId: values.categoryId,
      price: Number(values.price),
      stockQuantity: Number(values.stockQuantity),
      featured: form.elements.featured.checked,
    };
    if (selected) input.isActive = form.elements.isActive.checked;
    busy = true;
    setBusy(form, true);
    showError(null);
    try {
      const result = selected
        ? await adminCatalogApi.updateProduct(selected.id, input)
        : await adminCatalogApi.createProduct(input);
      showNotice(`${result.data.name} was ${selected ? 'updated' : 'created'}.`);
      edit();
      busy = false;
      await load();
    } catch (error) {
      showError(error);
    } finally {
      busy = false;
      setBusy(form, false);
    }
  });
  try {
    categories = (await adminCatalogApi.getCategories()).data;
    fillCategories(form.elements.categoryId, categories);
    fillCategories(find('#filter-form').elements.category, categories, true);
    find('#filter-form').elements.category.value =
      new URLSearchParams(location.search).get('category') ?? '';
    edit();
    await load();
    watchAvailability(load);
    showPage();
  } catch (error) {
    showError(error);
  }
}
