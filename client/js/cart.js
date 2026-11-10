import { cartApi } from './api.js';
import { getDemoProductImage } from './demo-images.js';
import { currentUser, pageReady, refreshCartBadge, showPage } from './common.js';
import { isStaffOrAdminUser, showOrderingRestrictedDialog } from './purchase.js';
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

export const SELECTED_CART_ITEMS_KEY = 'florea-selected-cart-items';

export function readSavedSelectedIds() {
  try {
    const raw = sessionStorage.getItem(SELECTED_CART_ITEMS_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function saveSelectedIds(ids) {
  try {
    sessionStorage.setItem(SELECTED_CART_ITEMS_KEY, JSON.stringify([...ids]));
  } catch {
    /* Ignore sessionStorage errors. */
  }
}

export const availabilityMessage = (item) =>
  item.availability === 'available'
    ? `${item.product.stock_quantity} available · ${item.quantity} in your cart`
    : item.availability === 'inactive'
      ? 'This product is no longer available.'
      : item.availability === 'out_of_stock'
        ? 'This product is out of stock.'
        : `Only ${item.product.stock_quantity} available · ${item.quantity} in your cart`;

if (document.body.dataset.page === 'cart' && (await pageReady)) {
  if (isStaffOrAdminUser(currentUser)) {
    const content = find('#cart-content');
    if (content) content.hidden = true;
    const empty = find('#cart-empty');
    if (empty) empty.hidden = false;
    showPage();
    showOrderingRestrictedDialog();
  } else {
    const items = new Map();
  let currentCart = null;
  let selectedIds = null;
  let knownIds = new Set();
  let busy = false;

  function syncSelection(cart) {
    const cartIds = new Set(cart.items.map((item) => item.id));
    if (selectedIds === null) {
      const saved = readSavedSelectedIds();
      const matching = saved ? saved.filter((id) => cartIds.has(id)) : [];
      selectedIds = new Set(matching.length > 0 ? matching : cartIds);
    } else {
      for (const id of [...selectedIds]) {
        if (!cartIds.has(id)) selectedIds.delete(id);
      }
      for (const id of cartIds) {
        if (!knownIds.has(id)) selectedIds.add(id);
      }
    }
    knownIds = cartIds;
    saveSelectedIds(selectedIds);
  }

  function renderSummary(cart) {
    const selectedItems = cart.items.filter((item) => selectedIds.has(item.id));
    const selectedSubtotal = selectedItems.reduce(
      (sum, item) => sum + Number(item.line_total),
      0,
    );
    const summaryRows = selectedItems.map((item) => {
      const row = copyTemplate('cart-summary-item-template');
      row.dataset.itemId = item.id;
      fillText(row, {
        'summary-name': item.product.name,
        'summary-line-total': currency(item.line_total),
        'summary-quantity': item.quantity,
      });
      const decrease = find('[data-summary-decrease]', row);
      const increase = find('[data-summary-increase]', row);
      const remove = find('[data-summary-remove]', row);
      decrease.setAttribute(
        'aria-label',
        `Deduct ${item.product.name} in order summary`,
      );
      increase.setAttribute('aria-label', `Add ${item.product.name} in order summary`);
      remove.setAttribute(
        'aria-label',
        `Remove ${item.product.name} from order summary`,
      );
      decrease.disabled = item.quantity <= 1;
      increase.disabled =
        item.quantity >= item.product.stock_quantity ||
        item.product.is_active === false;
      return row;
    });
    find('#cart-summary-items')?.replaceChildren(...summaryRows);
    const summaryEmpty = find('#cart-summary-empty');
    if (summaryEmpty) summaryEmpty.hidden = selectedItems.length > 0;
    const selectAll = find('#cart-select-all');
    if (selectAll) {
      selectAll.checked =
        cart.items.length > 0 && selectedIds.size === cart.items.length;
      selectAll.indeterminate =
        selectedIds.size > 0 && selectedIds.size < cart.items.length;
    }
    const checkoutLink = find('#cart-checkout-link');
    if (checkoutLink) {
      const noneSelected = selectedItems.length === 0;
      checkoutLink.setAttribute('aria-disabled', String(noneSelected));
      checkoutLink.classList.toggle('pointer-events-none', noneSelected);
      checkoutLink.classList.toggle('opacity-50', noneSelected);
    }
    fillText(document, {
      'cart-total': currency(selectedSubtotal),
      'cart-count': `${cart.summary.item_count} ${
        cart.summary.item_count === 1 ? 'piece' : 'pieces'
      } in your cart`,
      'selected-count': `${selectedItems.length} of ${cart.items.length} selected`,
    });
  }

  async function render(cart) {
    currentCart = cart;
    items.clear();
    syncSelection(cart);
    const itemsWithDemoImages = await Promise.all(
      cart.items.map(async (item) => ({
        ...item,
        product: {
          ...item.product,
          image_url:
            item.product.image_url ?? (await getDemoProductImage(item.product.id)),
        },
      })),
    );
    const content = find('#cart-content');
    if (content) content.hidden = cart.items.length === 0;
    find('#cart-empty').hidden = cart.items.length !== 0;
    const rows = itemsWithDemoImages.map((item) => {
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
      const checkbox = find('[data-cart-select]', row);
      if (checkbox) {
        checkbox.checked = selectedIds.has(item.id);
        checkbox.setAttribute('aria-label', `Select ${item.product.name} for checkout`);
      }
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
    renderSummary(cart);
    void refreshCartBadge(cart);
  }
  async function load() {
    if (busy) return;
    try {
      await render((await cartApi.getCart()).data.cart);
      showError(null);
    } catch (error) {
      showError(error);
    }
  }
  async function handleCartAction(event) {
    const button = event.target.closest(
      '[data-cart-decrease], [data-cart-increase], [data-cart-remove], [data-summary-decrease], [data-summary-increase], [data-summary-remove]',
    );
    if (!button || busy) return;
    const item = items.get(button.closest('[data-item-id]').dataset.itemId);
    if (!item) return;
    const isRemove =
      button.hasAttribute('data-cart-remove') ||
      button.hasAttribute('data-summary-remove');
    const isIncrease =
      button.hasAttribute('data-cart-increase') ||
      button.hasAttribute('data-summary-increase');
    busy = true;
    button.disabled = true;
    try {
      const response = isRemove
        ? await cartApi.removeItem(item.id)
        : await cartApi.updateItem(item.id, item.quantity + (isIncrease ? 1 : -1));
      await render(response.data.cart);
      showError(null);
    } catch (error) {
      showError(error);
      try {
        await render((await cartApi.getCart()).data.cart);
      } catch {
        /* Keep the existing cart and error. */
      }
    } finally {
      busy = false;
      button.disabled = false;
    }
  }
  find('#cart-items').addEventListener('click', handleCartAction);
  find('#cart-summary-items')?.addEventListener('click', handleCartAction);
  find('#cart-items').addEventListener('change', (event) => {
    const checkbox = event.target.closest('[data-cart-select]');
    if (!checkbox || !currentCart) return;
    const itemId = checkbox.closest('[data-item-id]').dataset.itemId;
    if (checkbox.checked) selectedIds.add(itemId);
    else selectedIds.delete(itemId);
    saveSelectedIds(selectedIds);
    renderSummary(currentCart);
  });
  find('#cart-select-all')?.addEventListener('change', (event) => {
    if (!currentCart) return;
    selectedIds = event.target.checked
      ? new Set(currentCart.items.map((item) => item.id))
      : new Set();
    saveSelectedIds(selectedIds);
    for (const checkbox of findAll('[data-cart-select]', find('#cart-items'))) {
      checkbox.checked = selectedIds.has(
        checkbox.closest('[data-item-id]').dataset.itemId,
      );
    }
    renderSummary(currentCart);
  });
  find('#cart-checkout-link')?.addEventListener('click', (event) => {
    if (!selectedIds || selectedIds.size === 0) event.preventDefault();
  });
    await load();
    watchAvailability(load);
    showPage();
  }
}
