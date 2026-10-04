import { cartApi } from './api.js';
import { pageReady, refreshCartBadge, showPage } from './common.js';
import {
  find,
  findAll,
  copyTemplate,
  fillText,
  currency,
  setImage,
  showError,
  watchAvailability,
} from './helpers.js';

export const availabilityMessage = (item) =>
  item.availability === 'available'
    ? `${item.product.stock_quantity} available · ${item.quantity} in your cart`
    : item.availability === 'inactive'
      ? 'This product is no longer available.'
      : item.availability === 'out_of_stock'
        ? 'This product is out of stock.'
        : `Only ${item.product.stock_quantity} available · ${item.quantity} in your cart`;

if (document.body.dataset.page === 'cart' && (await pageReady)) {
  const items = new Map();
  let busy = false;
  function render(cart) {
    const content = find('#cart-content');
    if (content) content.hidden = cart.items.length === 0;
    find('#cart-empty').hidden = cart.items.length !== 0;
    const rows = cart.items.map((item) => {
      items.set(item.id, item);
      const row = copyTemplate('cart-item-template');
      row.dataset.itemId = item.id;
      fillText(row, {
        name: item.product.name,
        category: item.product.category.name,
        'line-total': currency(item.line_total),
        quantity: item.quantity,
        'cart-stock': availabilityMessage(item),
      });
      setImage(find('img', row), item.product.image_url, item.product.name);
      for (const link of findAll('[data-product-link]', row))
        link.href = '/products/' + item.product.id;
      const decrease = find('[data-cart-decrease]', row),
        increase = find('[data-cart-increase]', row);
      decrease.setAttribute('aria-label', `Decrease ${item.product.name} quantity`);
      increase.setAttribute('aria-label', `Increase ${item.product.name} quantity`);
      decrease.disabled = item.quantity <= 1;
      increase.disabled =
        item.quantity >= item.product.stock_quantity ||
        item.product.is_active === false;
      const stock = find('[data-cart-stock]', row);
      stock.dataset.stockState =
        item.availability === 'available' ? 'available' : 'unavailable';
      row.classList.toggle('cart-line-changed', item.availability !== 'available');
      return row;
    });
    find('#cart-items').replaceChildren(...rows);
    fillText(document, {
      'cart-total': currency(cart.summary.subtotal),
      'cart-count': `${cart.summary.item_count} pieces in your cart`,
    });
    void refreshCartBadge(cart);
  }
  async function load() {
    if (busy) return;
    try {
      render((await cartApi.getCart()).data.cart);
      showError(null);
    } catch (error) {
      showError(error);
    }
  }
  find('#cart-items').addEventListener('click', async (event) => {
    const button = event.target.closest(
      '[data-cart-decrease], [data-cart-increase], [data-cart-remove]',
    );
    if (!button || busy) return;
    const item = items.get(button.closest('[data-item-id]').dataset.itemId);
    busy = true;
    button.disabled = true;
    try {
      const response = button.hasAttribute('data-cart-remove')
        ? await cartApi.removeItem(item.id)
        : await cartApi.updateItem(
            item.id,
            item.quantity + (button.hasAttribute('data-cart-increase') ? 1 : -1),
          );
      render(response.data.cart);
      showError(null);
    } catch (error) {
      showError(error);
      try {
        render((await cartApi.getCart()).data.cart);
      } catch {
        /* Keep the existing cart and error. */
      }
    } finally {
      busy = false;
      button.disabled = false;
    }
  });
  await load();
  watchAvailability(load);
  showPage();
}
