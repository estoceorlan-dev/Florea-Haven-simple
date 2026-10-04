import { orderApi } from './api.js';
import { pageReady, showPage } from './common.js';
import {
  find,
  findAll,
  fillText,
  copyTemplate,
  currency,
  dateTime,
  showError,
  watchAvailability,
  updatePagination,
} from './helpers.js';
import { orderStatusLabels } from './order-status.js';

export function fillOrderDetails(order) {
  fillText(document, {
    'order-heading': `Order ${order.id}`,
    'order-number': 'Order #' + order.id.slice(0, 8).toUpperCase(),
    'order-date': 'Placed ' + dateTime(order.created_at),
    'order-status': orderStatusLabels[order.status],
    'order-subtotal': currency(order.subtotal),
    'order-total': currency(order.total_amount),
    'status-date': 'Status updated ' + dateTime(order.status_updated_at),
    'confirmation-message': `We received order #${order.id.slice(0, 8).toUpperCase()}. Its purchase details are saved in your order history.`,
  });
  for (const badge of findAll('.order-status-badge'))
    badge.dataset.status = order.status;
  const address = order.delivery_address;
  fillText(document, {
    'delivery-address': [
      address.recipientName,
      address.addressLine1,
      address.addressLine2,
      `${address.city}, ${address.province} ${address.postalCode}`,
      address.country,
      address.phone,
    ]
      .filter(Boolean)
      .join('\n'),
  });
  find('#order-items').replaceChildren(
    ...order.items.map((item) => {
      const row = copyTemplate('order-item-template');
      fillText(row, {
        'item-name': item.product_name,
        'item-description': `${item.sku} · Qty ${item.quantity} · ${currency(item.unit_price)} each`,
        'line-total': currency(item.line_total),
      });
      return row;
    }),
  );
}

if (document.body.dataset.access !== 'admin' && (await pageReady)) {
  const page = document.body.dataset.page;
  if (page === 'orders') {
    async function load() {
      try {
        const result = await orderApi.getOrders(
          Object.fromEntries(new URLSearchParams(location.search)),
        );
        find('#order-list').replaceChildren(
          ...result.data.map((order) => {
            const row = copyTemplate('order-card-template');
            fillText(row, {
              'order-number': 'Order #' + order.id.slice(0, 8).toUpperCase(),
              'order-summary': `${dateTime(order.created_at)} · ${order.item_count} items · ${currency(order.total_amount)}`,
              'order-status': orderStatusLabels[order.status],
            });
            find('.order-status-badge', row).dataset.status = order.status;
            find('[data-order-link]', row).href = '/orders/' + order.id;
            return row;
          }),
        );
        find('#empty-state').hidden = result.data.length !== 0;
        updatePagination(result.pagination);
        showError(null);
      } catch (error) {
        showError(error);
      }
    }
    await load();
    watchAvailability(load);
  } else {
    const id =
      /^\/orders\/([^/]+)/.exec(location.pathname)?.[1] ??
      new URLSearchParams(location.search).get('id');
    async function load() {
      try {
        fillOrderDetails((await orderApi.getOrder(id)).data);
        showError(null);
      } catch (error) {
        showError(error);
      }
    }
    await load();
    watchAvailability(load);
  }
  showPage();
}
