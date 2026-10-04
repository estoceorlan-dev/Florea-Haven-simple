import { cartApi, orderApi } from './api.js';
import { pageReady, currentUser, refreshCartBadge, showPage } from './common.js';
import { availabilityMessage } from './cart.js';
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
  form.elements.recipientName.value = currentUser.name;
  form.elements.country.value = 'Philippines';
  let cart = null;
  let busy = false;
  let lastSubmission = null;
  function renderCart() {
    form.hidden = cart.items.length === 0;
    find('#empty-state').hidden = cart.items.length !== 0;
    find('#checkout-items').replaceChildren(
      ...cart.items.map((item) => {
        const row = copyTemplate('checkout-item-template');
        fillText(row, {
          'line-name': `${item.product.name} × ${item.quantity}`,
          'line-total': currency(item.line_total),
          'cart-stock': availabilityMessage(item),
        });
        const unavailable = item.availability !== 'available';
        row.classList.toggle('cart-line-changed', unavailable);
        find('[data-cart-stock]', row).dataset.stockState = unavailable
          ? 'unavailable'
          : 'available';
        return row;
      }),
    );
    fillText(form, { 'cart-total': currency(cart.summary.subtotal) });
    find('[type=submit]', form).disabled = busy || cart.summary.has_unavailable_items;
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
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy || !cart) return;
    busy = true;
    setBusy(form, true);
    showError(null);
    const address = formValues(form);
    try {
      // Retry an uncertain network result with the exact same request and key.
      const retry =
        lastSubmission?.uncertain &&
        JSON.stringify(address) ===
          JSON.stringify(lastSubmission.input.deliveryAddress);
      if (!retry) {
        const latest = (await cartApi.getCart()).data.cart;
        const changed = latest.revision !== cart.revision;
        cart = latest;
        renderCart();
        if (changed || cart.summary.has_unavailable_items || !cart.items.length) {
          throw new Error(
            'Your cart or availability changed. Review the updated order summary before continuing.',
          );
        }
        const input = {
          paymentMethod: 'cash_on_delivery',
          cartRevision: cart.revision,
          deliveryAddress: address,
        };
        if (
          !lastSubmission ||
          JSON.stringify(lastSubmission.input) !== JSON.stringify(input)
        )
          lastSubmission = { input, key: crypto.randomUUID(), uncertain: false };
      }
      const {
        data: { order },
      } = await orderApi.placeOrder(lastSubmission.input, lastSubmission.key);
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
      if (cart.summary.has_unavailable_items)
        find('[type=submit]', form).disabled = true;
    }
  });
  await load();
  showPage();
  watchAvailability(load, 10000);
}
