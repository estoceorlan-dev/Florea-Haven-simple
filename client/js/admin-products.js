import { adminCatalogApi, catalogApi, imageApi } from './api.js';
import { currentUser, pageReady, showPage } from './common.js';
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
  setupAdminModal,
} from './admin-helpers.js';
import { enableUpload } from './upload.js';
import {
  getDemoProductImage,
  removeDemoProductImage,
  saveDemoProductImage,
} from './demo-images.js';

if (await pageReady) {
  const form = find('#product-form');
  const modalError = find('[data-modal-error]', form);
  const rows = new Map();
  let selected = null;
  let categories = [];
  let busy = false;
  let demoImageFile = null;
  let demoPreviewUrl = '';
  enableFilters();
  const modal = setupAdminModal('product-modal', () => {
    edit();
    modal.close();
  });
  function closeModal() {
    edit();
    modal.close();
  }
  function edit(product = null) {
    selected = product;
    showError(null, modalError);
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
            'featured-status': product.featured ? 'Enabled' : 'Disabled',
            'active-status': product.is_active ? 'Active' : 'Inactive',
          });
          setImage(find('img', row), product.image_url, '');
          find('[data-edit-product]', row).setAttribute(
            'aria-label',
            `Edit ${product.name}`,
          );
          const featuredToggle = find('[data-toggle-featured]', row);
          if (featuredToggle) {
            const isFeatured = Boolean(product.featured);
            featuredToggle.setAttribute('aria-checked', String(isFeatured));
            featuredToggle.setAttribute(
              'aria-label',
              `${isFeatured ? 'Disable' : 'Enable'} Featured on Home for ${product.name}`,
            );
            featuredToggle.title = isFeatured
              ? 'Featured on Home (click to disable)'
              : 'Not featured on Home (click to enable)';
          }
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
  find('[data-new-product]')?.addEventListener('click', (event) => {
    edit();
    modal.open(event.currentTarget);
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
  find('[data-cancel-editing]', form).addEventListener('click', closeModal);
  find('#admin-product-list').addEventListener('click', (event) => {
    const button = event.target.closest(
      '[data-edit-product], [data-toggle-product], [data-toggle-featured]',
    );
    if (!button) return;
    const product = rows.get(button.closest('[data-product-id]').dataset.productId);
    if (button.hasAttribute('data-edit-product')) {
      edit(product);
      modal.open(button);
      return;
    }
    if (button.hasAttribute('data-toggle-featured')) {
      void (async () => {
        button.disabled = true;
        try {
          const nextFeatured = !product.featured;
          await adminCatalogApi.updateProduct(product.id, {
            featured: nextFeatured,
          });
          showNotice(
            nextFeatured
              ? `${product.name} is now featured on Home.`
              : `${product.name} was removed from Featured on Home.`,
          );
          if (selected?.id === product.id) {
            selected = { ...selected, featured: nextFeatured };
            fillForm(form, { featured: nextFeatured });
          }
          await load();
        } catch (error) {
          showError(error);
        } finally {
          button.disabled = false;
        }
      })();
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
      if (selected?.id === product.id) closeModal();
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
  function validateProductForm() {
    const rawName = form.elements.name.value.trim();
    const rawSku = form.elements.sku.value;
    const trimmedSku = rawSku.trim();
    const rawCategory = form.elements.categoryId.value.trim();
    const rawSlug = form.elements.slug.value;
    const trimmedSlug = rawSlug.trim();
    const rawPrice = form.elements.price.value.trim();
    const rawStock = form.elements.stockQuantity.value.trim();
    const rawDescription = form.elements.description.value.trim();

    const missing = [];
    if (!rawName) missing.push('Product name');
    if (!trimmedSku) missing.push('SKU');
    if (!rawCategory) missing.push('Category');
    if (rawPrice === '') missing.push('Price');
    if (rawStock === '') missing.push('Stock quantity');
    if (!rawDescription) missing.push('Description');
    if (missing.length > 0) {
      return new Error(
        missing.length === 1
          ? `${missing[0]} is required. Please fill in all required fields.`
          : `Please fill in all required fields: ${missing.join(', ')}.`,
      );
    }
    if (rawName.length < 2 || rawName.length > 120) {
      return new Error('Product name must be between 2 and 120 characters.');
    }
    if (/\s/.test(rawSku)) {
      return new Error(
        'SKU cannot contain spaces. Use letters, numbers, hyphens (-), underscores (_), or periods (.).',
      );
    }
    if (
      trimmedSku.length < 2 ||
      trimmedSku.length > 50 ||
      !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(trimmedSku)
    ) {
      return new Error(
        'Invalid SKU format. Start with a letter or number and use only letters, numbers, hyphens (-), underscores (_), or periods (.) with no spaces.',
      );
    }
    if (/\s/.test(rawSlug)) {
      return new Error(
        'Slug cannot contain spaces. Use lowercase letters, numbers, and hyphens (-).',
      );
    }
    if (
      trimmedSlug &&
      (trimmedSlug.length < 2 ||
        trimmedSlug.length > 60 ||
        !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(trimmedSlug))
    ) {
      return new Error(
        'Slug must use lowercase letters, numbers, and single hyphens only (no spaces).',
      );
    }
    const price = Number(rawPrice);
    if (!Number.isFinite(price) || price < 0 || price > 9999999.99) {
      return new Error('Enter a valid price between 0 and 9,999,999.99.');
    }
    const stockQuantity = Number(rawStock);
    if (!Number.isInteger(stockQuantity) || stockQuantity < 0) {
      return new Error('Stock quantity must be a whole number (0 or greater).');
    }
    return null;
  }

  form.addEventListener('input', (event) => {
    if (event.target.name === 'sku' && /\s/.test(event.target.value)) {
      showError(
        new Error(
          'SKU cannot contain spaces. Use letters, numbers, hyphens (-), underscores (_), or periods (.).',
        ),
        modalError,
      );
      return;
    }
    showError(null, modalError);
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy) return;
    const validationError = validateProductForm();
    if (validationError) {
      showError(validationError, modalError);
      modalError?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      return;
    }
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
    showError(null, modalError);
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
      closeModal();
      busy = false;
      await load();
    } catch (error) {
      showError(error, modalError);
      modalError?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
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
    const categoryResult =
      currentUser?.role === 'admin'
        ? await adminCatalogApi.getCategories()
        : await catalogApi.getCategories();
    categories = categoryResult.data;
    fillCategories(form.elements.categoryId, categories);
    fillCategories(find('#filter-form').elements.category, categories, true);
    find('#filter-form').elements.category.value =
      new URLSearchParams(location.search).get('category') ?? '';
    edit();
    await load();
    watchAvailability(load);
  } catch (error) {
    showError(error);
  } finally {
    showPage();
  }
}
