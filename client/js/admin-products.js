import { adminCatalogApi, imageApi } from './api.js';
import { pageReady, showPage } from './common.js';
import {
  find,
  fillText,
  copyTemplate,
  currency,
  setImage,
  showError,
  showNotice,
  showCenterNotice,
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
import {
  getDemoProductImage,
  removeDemoProductImage,
  saveDemoProductImage,
} from './demo-images.js';

if (await pageReady) {
  const form = find('#product-form');
  const rows = new Map();
  let selected = null;
  let categories = [];
  let busy = false;
  let demoImageFile = null;
  let demoPreviewUrl = '';
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
    uploader.hidden = false;
    if (demoPreviewUrl) URL.revokeObjectURL(demoPreviewUrl);
    demoPreviewUrl = '';
    demoImageFile = null;
    find('[data-upload-save]').textContent = 'Save with product';
    if (product) {
      find('#product-image').value = '';
      enableUpload(
        uploader,
        `/api/products/${product.id}/image`,
        product.image_url,
        async (result) => {
          selected = result.data.product ?? result.data;
          await removeDemoProductImage(product.id);
          void load();
        },
      );
    } else {
      find('#product-image').value = '';
      find('#product-image').onchange = null;
      find('[data-upload-save]', uploader).onclick = null;
      find('[data-upload-remove]', uploader).onclick = null;
      find('[data-upload-cancel]', uploader).onclick = null;
      find('[data-upload-preview]', uploader).hidden = true;
      find('[data-upload-fallback]', uploader).hidden = false;
      find('[data-upload-save]', uploader).disabled = true;
      find('[data-upload-remove]', uploader).hidden = true;
      find('[data-upload-cancel]', uploader).hidden = true;
      find('[data-upload-message]', uploader).textContent = '';
      find('[data-upload-message]', uploader).hidden = true;
      find('[data-upload-save]', uploader).textContent = 'Save with product';
      const indicator = find('[data-upload-indicator]', uploader);
      const indicatorText = find('[data-upload-indicator-text]', uploader);
      if (indicator && indicatorText) {
        indicator.dataset.state = 'idle';
        indicatorText.textContent = 'Ready to upload';
      }
    }
    if (product) find('[data-upload-save]', uploader).textContent = 'Upload image';
  }
  async function load() {
    if (busy) return;
    try {
      const result = await adminCatalogApi.getProducts({
        ...Object.fromEntries(new URLSearchParams(location.search)),
        limit: 20,
      });
      const products = await Promise.all(
        result.data.map(async (product) => ({
          ...product,
          image_url: product.image_url ?? (await getDemoProductImage(product.id)),
        })),
      );
      find('#admin-product-list').replaceChildren(
        ...products.map((product) => {
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
  find('#product-image').addEventListener('change', (event) => {
    if (selected) return;
    const file = event.target.files?.[0];
    const uploader = find('#product-upload');
    const message = find('[data-upload-message]', uploader);
    const indicator = find('[data-upload-indicator]', uploader);
    const indicatorText = find('[data-upload-indicator-text]', uploader);
    if (demoPreviewUrl) URL.revokeObjectURL(demoPreviewUrl);
    demoPreviewUrl = '';
    demoImageFile = null;
    find('[data-upload-save]').textContent = 'Save with product';
    if (
      file &&
      (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) ||
        file.size > 5 * 1024 * 1024)
    ) {
      message.textContent = 'Choose a JPEG, PNG, or WebP image up to 5 MB.';
      message.setAttribute('role', 'alert');
      find('[data-upload-preview]').hidden = true;
      find('[data-upload-fallback]').hidden = false;
      if (indicator && indicatorText) {
        indicator.dataset.state = 'idle';
        indicatorText.textContent = 'Ready to upload';
      }
    } else if (file) {
      demoImageFile = file;
      demoPreviewUrl = URL.createObjectURL(file);
      const preview = find('[data-upload-preview]');
      preview.src = demoPreviewUrl;
      preview.hidden = false;
      find('[data-upload-fallback]').hidden = true;
      message.textContent = 'Image will be uploaded when you create the product.';
      message.setAttribute('role', 'status');
      find('[data-upload-save]').textContent = 'Create product with image';
      if (indicator && indicatorText) {
        indicator.dataset.state = 'selected';
        indicatorText.textContent = file.name;
      }
    } else if (indicator && indicatorText) {
      indicator.dataset.state = 'idle';
      indicatorText.textContent = 'Ready to upload';
    }
    message.hidden = !file;
    find('[data-upload-save]').disabled = !demoImageFile;
    find('[data-upload-cancel]').hidden = !demoImageFile;
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
    const pendingFile = selected ? find('#product-image').files?.[0] : demoImageFile;
    busy = true;
    setBusy(form, true);
    showError(null);
    try {
      const wasEditing = Boolean(selected);
      const uploader = find('#product-upload');
      const indicator = find('[data-upload-indicator]', uploader);
      const indicatorText = find('[data-upload-indicator-text]', uploader);
      const progress = find('[data-upload-progress]', uploader);
      const result = selected
        ? await adminCatalogApi.updateProduct(selected.id, input)
        : await adminCatalogApi.createProduct(input);
      if (pendingFile) {
        if (indicator && indicatorText) {
          indicator.dataset.state = 'uploading';
          indicatorText.textContent = 'Uploading…';
        }
        if (progress) {
          progress.value = 0;
          progress.hidden = false;
        }
        try {
          await imageApi.upload(
            `/api/products/${result.data.id}/image`,
            pendingFile,
            (val) => {
              if (progress) progress.value = val;
            },
          );
          await removeDemoProductImage(result.data.id);
        } catch (uploadError) {
          if (!selected) await saveDemoProductImage(result.data.id, pendingFile);
          else throw uploadError;
        } finally {
          if (progress) progress.hidden = true;
        }
      }
      showNotice(`${result.data.name} was ${wasEditing ? 'updated' : 'created'}.`);
      showCenterNotice(wasEditing ? 'Product updated' : 'Product added');
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
  find('[data-upload-save]', find('#product-upload')).addEventListener('click', () => {
    if (!selected && demoImageFile) form.requestSubmit();
  });
  find('[data-upload-cancel]', find('#product-upload')).addEventListener(
    'click',
    () => {
      if (selected) return;
      if (demoPreviewUrl) URL.revokeObjectURL(demoPreviewUrl);
      demoPreviewUrl = '';
      demoImageFile = null;
      find('#product-image').value = '';
      find('[data-upload-preview]').hidden = true;
      find('[data-upload-fallback]').hidden = false;
      find('[data-upload-save]').disabled = true;
      find('[data-upload-save]').textContent = 'Save with product';
      find('[data-upload-cancel]').hidden = true;
      find('[data-upload-message]').hidden = true;
      const indicator = find('[data-upload-indicator]', find('#product-upload'));
      const indicatorText = find(
        '[data-upload-indicator-text]',
        find('#product-upload'),
      );
      if (indicator && indicatorText) {
        indicator.dataset.state = 'idle';
        indicatorText.textContent = 'Ready to upload';
      }
    },
  );
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
