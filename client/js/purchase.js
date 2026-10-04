import { catalogApi, cartApi, orderApi } from './api.js';
import { currentUser, refreshCartBadge } from './common.js';
import {
  find,
  findAll,
  copyTemplate,
  fillText,
  currency,
  setImage,
  updateStock,
  formValues,
  showError,
} from './helpers.js';

// The dialog, review panel, and delivery form are in the page's HTML template.
export function openPurchase(product, trigger, initialQuantity = 1) {
  const dialog = copyTemplate('purchase-template');
  document.body.append(dialog);
  let item = product;
  let quantity = Math.max(
    1,
    Math.min(Math.trunc(Number(initialQuantity)) || 1, item.stock_quantity || 1, 999),
  );
  let busy = false;
  let fingerprint = '';
  let idempotencyKey = '';
  const review = find('[data-purchase-review]', dialog);
  const form = find('#purchase-form', dialog);
  const errorBox = find('[data-purchase-error]', dialog);
  const proceed = find('[data-purchase-continue]', dialog);
  const closeButton = find('[data-purchase-close]', dialog);
  const previousOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
  form.elements.recipientName.value = currentUser?.name ?? '';
  form.elements.country.value = 'Philippines';

  function refresh() {
    fillText(dialog, {
      name: item.name,
      category: item.category.name,
      'unit-price': currency(item.price),
    });
    setImage(find('[data-field=image]', dialog), item.image_url, item.name);
    find('[data-purchase-quantity]', dialog).textContent = quantity;
    for (const total of findAll('[data-purchase-total]', dialog))
      total.textContent = currency(item.price * quantity);
    updateStock(dialog, item.stock_quantity, quantity);
    proceed.textContent = currentUser ? 'Continue to checkout' : 'Sign in to checkout';
    find('[data-quantity-decrease]', dialog).disabled = busy || quantity <= 1;
    find('[data-quantity-increase]', dialog).disabled =
      busy || quantity >= Math.min(item.stock_quantity, 999);
    proceed.disabled = busy || item.stock_quantity < quantity;
    find('[type=submit]', form).disabled = busy || item.stock_quantity < quantity;
    closeButton.disabled = busy;
  }
  function setStep(checkout) {
    review.hidden = checkout;
    form.hidden = !checkout;
    find('#purchase-title', dialog).textContent = checkout
      ? 'Checkout'
      : 'Make it yours';
    find('[data-purchase-step]', dialog).textContent = checkout
      ? '2. Delivery & payment'
      : '1. Review your selection';
  }
  function close() {
    if (busy) return;
    dialog.close();
    dialog.remove();
    document.body.style.overflow = previousOverflow;
    trigger?.focus();
  }
  closeButton.addEventListener('click', close);
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    close();
  });
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) close();
  });
  find('[data-quantity-decrease]', dialog).addEventListener('click', () => {
    if (quantity > 1) quantity--;
    refresh();
  });
  find('[data-quantity-increase]', dialog).addEventListener('click', () => {
    if (quantity < item.stock_quantity) quantity++;
    refresh();
  });
  find('[data-purchase-back]', dialog).addEventListener('click', () => {
    setStep(false);
    showError(null, errorBox);
  });
  proceed.addEventListener('click', async () => {
    if (!currentUser) {
      sessionStorage.setItem(
        'florea-return-path',
        `/products/${item.id}?buy=1&quantity=${quantity}`,
      );
      location.assign('/login');
      return;
    }
    busy = true;
    refresh();
    showError(null, errorBox);
    try {
      const previousPrice = item.price;
      item = (await catalogApi.getProduct(item.id)).data;
      if (item.is_active === false || item.stock_quantity < quantity)
        throw new Error(
          'Availability changed. Review the current stock before continuing.',
        );
      if (Number(item.price) !== Number(previousPrice))
        throw new Error('The price changed. Review the updated total, then continue.');
      setStep(true);
    } catch (error) {
      showError(error, errorBox);
    } finally {
      busy = false;
      refresh();
    }
  });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy) return;
    const input = {
      productId: item.id,
      quantity,
      expectedUnitPrice: Number(item.price),
      paymentMethod: 'cash_on_delivery',
      deliveryAddress: formValues(form),
    };
    const nextFingerprint = JSON.stringify(input);
    if (fingerprint !== nextFingerprint) {
      fingerprint = nextFingerprint;
      idempotencyKey = crypto.randomUUID();
    }
    busy = true;
    refresh();
    showError(null, errorBox);
    try {
      const {
        data: { order },
      } = await orderApi.buyNow(input, idempotencyKey);
      location.assign(`/orders/${order.id}/confirmation`);
    } catch (error) {
      showError(error, errorBox);
      if (
        ['PRICE_CHANGED', 'PRODUCT_INACTIVE', 'INSUFFICIENT_STOCK'].includes(error.code)
      ) {
        setStep(false);
        try {
          item = (await catalogApi.getProduct(item.id)).data;
        } catch {
          /* Retain the last checked selection. */
        }
      }
      busy = false;
      refresh();
    }
  });
  refresh();
  dialog.showModal();
  closeButton.focus();
}

export function enablePurchases(products) {
  document.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-buy-now], [data-add-cart]');
    if (!button) return;
    const id = button.closest('[data-product-id]')?.dataset.productId;
    const product = products.get(id);
    if (!product) return;
    if (button.hasAttribute('data-buy-now')) {
      openPurchase(product, button);
      return;
    }
    if (!currentUser) {
      sessionStorage.setItem('florea-return-path', `/products/${id}`);
      location.assign('/login');
      return;
    }
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    try {
      const cart = (await cartApi.addItem(id, 1)).data.cart;
      await refreshCartBadge(cart);
      showError(null);
    } catch (error) {
      showError(error);
    } finally {
      button.disabled = false;
      button.setAttribute('aria-busy', 'false');
    }
  });
}
