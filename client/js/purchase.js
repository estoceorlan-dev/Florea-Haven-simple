import { catalogApi, cartApi, orderApi } from './api.js';
import { currentUser, refreshCartBadge } from './common.js';
import { simulateCashlessPayment } from './payment-simulation.js';
import {
  find,
  findAll,
  copyTemplate,
  fillText,
  currency,
  setImage,
  updateStock,
  formValues,
  showCenterNotice,
  showError,
} from './helpers.js';

export function isStaffOrAdminUser(user = currentUser) {
  return Boolean(user && ['admin', 'staff'].includes(user.role));
}

export function showOrderingRestrictedDialog(trigger) {
  const roleLabel = currentUser?.role === 'staff' ? 'Staff' : 'Administrator';
  const workspaceHref =
    currentUser?.role === 'staff' ? '/admin/products' : '/admin';
  const message = `${roleLabel} accounts are for catalog and order management only and cannot add items to the cart or place customer orders. Please sign in with a customer account to shop.`;

  showError(new Error(message));

  const existing = document.getElementById('ordering-restricted-dialog');
  if (existing) existing.remove();

  const dialog = document.createElement('dialog');
  dialog.id = 'ordering-restricted-dialog';
  dialog.className =
    'm-auto w-[min(100%-1.5rem,28rem)] overflow-hidden rounded-[1.5rem] border border-border bg-surface p-0 text-text shadow-high backdrop:bg-black/60';
  dialog.setAttribute('aria-label', `Ordering restricted for ${roleLabel} accounts`);

  const header = document.createElement('div');
  header.className = 'border-b border-border bg-surface-muted px-5 py-4';

  const eyebrow = document.createElement('p');
  eyebrow.className = 'eyebrow text-danger';
  eyebrow.textContent = `${roleLabel} Account Restriction`;

  const title = document.createElement('h2');
  title.className = 'mt-1.5 font-display text-2xl text-floral-pink';
  title.textContent = 'Ordering Not Available';

  header.append(eyebrow, title);

  const body = document.createElement('div');
  body.className = 'p-5 grid gap-4 text-xs leading-5 text-text-muted';

  const description = document.createElement('p');
  description.textContent = `You are currently signed in as ${currentUser?.name ?? roleLabel} (${roleLabel}). ${message}`;

  const actions = document.createElement('div');
  actions.className = 'flex flex-col-reverse gap-2.5 pt-1 sm:flex-row sm:justify-end';

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'button-secondary';
  closeBtn.textContent = 'Close';

  const workspaceLink = document.createElement('a');
  workspaceLink.href = workspaceHref;
  workspaceLink.className = 'button-primary';
  workspaceLink.textContent = `Go to ${roleLabel.toLowerCase()} workspace`;

  actions.append(closeBtn, workspaceLink);
  body.append(description, actions);
  dialog.append(header, body);
  document.body.append(dialog);

  function close() {
    dialog.close();
    dialog.remove();
    trigger?.focus();
  }

  closeBtn.addEventListener('click', close);
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    close();
  });
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) close();
  });

  dialog.showModal();
  closeBtn.focus();
}

// The dialog, review panel, and delivery form are in the page's HTML template.
export function openPurchase(product, trigger, initialQuantity = 1) {
  if (isStaffOrAdminUser()) {
    showOrderingRestrictedDialog(trigger);
    return;
  }
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
    if (!form.reportValidity()) return;
    const { paymentMethod = 'cash_on_delivery', ...deliveryAddress } = formValues(form);
    const simulation = await simulateCashlessPayment({
      method: paymentMethod,
      amount: Number(item.price) * quantity,
      phone: deliveryAddress.phone,
    });
    if (!simulation.approved) return;
    const input = {
      productId: item.id,
      quantity,
      expectedUnitPrice: Number(item.price),
      paymentMethod,
      deliveryAddress,
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
    if (isStaffOrAdminUser()) {
      showOrderingRestrictedDialog(button);
      return;
    }
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
      showCenterNotice('Product added');
      showError(null);
    } catch (error) {
      showError(error);
    } finally {
      button.disabled = false;
      button.setAttribute('aria-busy', 'false');
    }
  });
}
