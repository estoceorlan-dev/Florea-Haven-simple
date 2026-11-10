import { cartApi, orderApi } from './api.js';
import { pageReady, currentUser, refreshCartBadge, showPage } from './common.js';
import { availabilityMessage, readSavedSelectedIds, saveSelectedIds } from './cart.js';
import { isStaffOrAdminUser, showOrderingRestrictedDialog } from './purchase.js';
import { paymentSubmitLabels, simulateCashlessPayment } from './payment-simulation.js';
import {
  find,
  copyTemplate,
  fillText,
  currency,
  formValues,
  showError,
  watchAvailability,
  setBusy,
} from './helpers.js';

if (await pageReady) {
  const form = find('#checkout-form');
  if (isStaffOrAdminUser(currentUser)) {
    form.hidden = true;
    const emptyState = find('#empty-state');
    if (emptyState) emptyState.hidden = false;
    showPage();
    showOrderingRestrictedDialog();
  } else {
    form.elements.recipientName.value = currentUser.name;
  form.elements.country.value = 'Philippines';
  const items = new Map();
  let cart = null;
  let selectedIds = null;
  let busy = false;
  let lastSubmission = null;

  function syncSelectedIds() {
    const cartIds = new Set(cart.items.map((item) => item.id));
    if (selectedIds === null) {
      const saved = readSavedSelectedIds();
      const matching = saved ? saved.filter((id) => cartIds.has(id)) : [];
      selectedIds = new Set(matching.length > 0 ? matching : cartIds);
    } else {
      for (const id of [...selectedIds]) {
        if (!cartIds.has(id)) selectedIds.delete(id);
      }
    }
  }

  function selectedCartItems() {
    return cart ? cart.items.filter((item) => selectedIds?.has(item.id)) : [];
  }

  function selectedSummary(selectedItems) {
    const subtotal = selectedItems.reduce(
      (sum, item) => sum + Number(item.line_total),
      0,
    );
    const hasUnavailable = selectedItems.some(
      (item) => item.availability !== 'available',
    );
    return { subtotal, hasUnavailable };
  }

  function renderCart() {
    syncSelectedIds();
    items.clear();
    const selectedItems = selectedCartItems();
    const { subtotal, hasUnavailable } = selectedSummary(selectedItems);
    form.hidden = selectedItems.length === 0;
    find('#empty-state').hidden = selectedItems.length !== 0;
    find('#checkout-items').replaceChildren(
      ...selectedItems.map((item) => {
        items.set(item.id, item);
        const row = copyTemplate('checkout-item-template');
        row.dataset.itemId = item.id;
        fillText(row, {
          'line-name': `${item.product.name} × ${item.quantity}`,
          'line-total': currency(item.line_total),
          'cart-stock': availabilityMessage(item),
          'checkout-quantity': item.quantity,
        });
        const decrease = find('[data-checkout-decrease]', row);
        const increase = find('[data-checkout-increase]', row);
        const remove = find('[data-checkout-remove]', row);
        if (decrease) {
          decrease.setAttribute('aria-label', `Deduct ${item.product.name} quantity`);
          decrease.disabled = item.quantity <= 1;
        }
        if (increase) {
          increase.setAttribute('aria-label', `Add ${item.product.name} quantity`);
          increase.disabled =
            item.quantity >= item.product.stock_quantity ||
            item.product.is_active === false;
        }
        if (remove) {
          remove.setAttribute('aria-label', `Remove ${item.product.name}`);
        }
        const unavailable = item.availability !== 'available';
        row.classList.toggle('cart-line-changed', unavailable);
        find('[data-cart-stock]', row).dataset.stockState = unavailable
          ? 'unavailable'
          : 'available';
        return row;
      }),
    );
    fillText(form, { 'cart-total': currency(subtotal) });
    find('[type=submit]', form).disabled =
      busy || hasUnavailable || selectedItems.length === 0;
    void refreshCartBadge(cart);
  }
  async function load() {
    // Keep the original summary available when a lost response needs an exact retry.
    if (busy || lastSubmission?.uncertain) return;
    try {
      const latest = (await cartApi.getCart()).data.cart;
      if (cart && latest.revision !== cart.revision)
        showError(
          new Error(
            'Your cart or availability changed. Review the updated order summary before continuing.',
          ),
        );
      cart = latest;
      renderCart();
    } catch (error) {
      showError(error);
    }
  }
  find('#checkout-items').addEventListener('click', async (event) => {
    const button = event.target.closest(
      '[data-checkout-decrease], [data-checkout-increase], [data-checkout-remove]',
    );
    if (!button || busy) return;
    const item = items.get(button.closest('[data-item-id]')?.dataset.itemId);
    if (!item) return;
    busy = true;
    button.disabled = true;
    try {
      const response = button.hasAttribute('data-checkout-remove')
        ? await cartApi.removeItem(item.id)
        : await cartApi.updateItem(
            item.id,
            item.quantity + (button.hasAttribute('data-checkout-increase') ? 1 : -1),
          );
      if (button.hasAttribute('data-checkout-remove')) {
        selectedIds?.delete(item.id);
        saveSelectedIds(selectedIds ?? []);
      }
      cart = response.data.cart;
      lastSubmission = null;
      renderCart();
      showError(null);
    } catch (error) {
      showError(error);
      try {
        cart = (await cartApi.getCart()).data.cart;
        renderCart();
      } catch {
        /* Keep existing checkout state. */
      }
    } finally {
      busy = false;
      button.disabled = false;
    }
  });
  form.addEventListener('change', (event) => {
    if (event.target.name === 'paymentMethod') {
      fillText(form, {
        'submit-label': paymentSubmitLabels[event.target.value] ?? 'Place order',
      });
    }
  });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy || !cart) return;
    if (!form.reportValidity()) return;
    busy = true;
    setBusy(form, true);
    showError(null);
    const { paymentMethod = 'cash_on_delivery', ...address } = formValues(form);
    try {
      // Retry an uncertain network result with the exact same request and key.
      const retry =
        lastSubmission?.uncertain &&
        paymentMethod === lastSubmission.input.paymentMethod &&
        JSON.stringify(address) ===
          JSON.stringify(lastSubmission.input.deliveryAddress);
      if (!retry) {
        const latest = (await cartApi.getCart()).data.cart;
        const changed = latest.revision !== cart.revision;
        cart = latest;
        renderCart();
        const selectedItems = selectedCartItems();
        const { subtotal, hasUnavailable } = selectedSummary(selectedItems);
        if (changed || hasUnavailable || !selectedItems.length) {
          throw new Error(
            'Your cart or availability changed. Review the updated order summary before continuing.',
          );
        }
        const simulation = await simulateCashlessPayment({
          method: paymentMethod,
          amount: subtotal,
          phone: address.phone,
        });
        if (!simulation.approved) {
          busy = false;
          setBusy(form, false);
          return;
        }
        const input = {
          paymentMethod,
          cartRevision: cart.revision,
          deliveryAddress: address,
        };
        if (selectedItems.length < cart.items.length) {
          input.itemIds = selectedItems.map((item) => item.id);
        }
        if (
          !lastSubmission ||
          JSON.stringify(lastSubmission.input) !== JSON.stringify(input)
        )
          lastSubmission = { input, key: crypto.randomUUID(), uncertain: false };
      }
      const {
        data: { order },
      } = await orderApi.placeOrder(lastSubmission.input, lastSubmission.key);
      saveSelectedIds([]);
      location.assign(`/orders/${order.id}/confirmation`);
    } catch (error) {
      if (lastSubmission) lastSubmission.uncertain = error.status === 0;
      showError(error);
      if (
        ['CART_CHANGED', 'INSUFFICIENT_STOCK', 'PRODUCT_INACTIVE'].includes(error.code)
      ) {
        cart =
          error.details?.cart ??
          (await cartApi.getCart().catch(() => null))?.data.cart ??
          cart;
        renderCart();
      }
      busy = false;
      setBusy(form, false);
      const { hasUnavailable } = selectedSummary(selectedCartItems());
      if (hasUnavailable) find('[type=submit]', form).disabled = true;
    }
  });
    await load();
    showPage();
    watchAvailability(load, 10000);
  }
}
