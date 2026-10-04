import { adminOrderApi } from './api.js';
import { pageReady, showPage } from './common.js';
import {
  find,
  findAll,
  fillText,
  copyTemplate,
  currency,
  dateTime,
  showError,
  showNotice,
  confirmAction,
  watchAvailability,
} from './helpers.js';
import { allowedOrderTransitions, orderStatusLabels } from './order-status.js';
import { fillOrderDetails } from './orders.js';
import { enableFilters, updatePagination } from './admin-helpers.js';

if (await pageReady) {
  if (document.body.dataset.page === 'admin-order') {
    const id =
      /^\/admin\/orders\/([^/]+)/.exec(location.pathname)?.[1] ??
      new URLSearchParams(location.search).get('id');
    let busy = false;
    function render(order) {
      fillOrderDetails(order);
      fillText(document, {
        'customer-name': order.customer.name,
        'customer-email': order.customer.email,
      });
      find('[data-customer-email]').href = 'mailto:' + order.customer.email;
      for (const button of findAll('[data-order-status]'))
        button.hidden = !(allowedOrderTransitions[order.status] ?? []).includes(
          button.dataset.orderStatus,
        );
    }
    async function load() {
      if (busy) return;
      try {
        render((await adminOrderApi.getOrder(id)).data);
      } catch (error) {
        showError(error);
      }
    }
    find('#order-actions').addEventListener('click', (event) => {
      const button = event.target.closest('[data-order-status]');
      if (!button || busy) return;
      const status = button.dataset.orderStatus;
      async function change() {
        busy = true;
        for (const action of findAll('[data-order-status]')) action.disabled = true;
        try {
          const result = await adminOrderApi.updateStatus(id, status);
          render(result.data);
          showNotice(`Order status updated to ${result.data.status}.`);
          showError(null);
        } finally {
          busy = false;
          for (const action of findAll('[data-order-status]')) action.disabled = false;
        }
      }
      if (status === 'cancelled')
        confirmAction({
          title: 'Cancel this order?',
          description:
            'Every item will be returned to inventory. The order remains in the customer’s history.',
          label: 'Cancel order',
          trigger: button,
          action: change,
        });
      else void change().catch(showError);
    });
    await load();
    watchAvailability(load);
  } else {
    enableFilters();
    async function load() {
      try {
        const result = await adminOrderApi.getOrders({
          ...Object.fromEntries(new URLSearchParams(location.search)),
          limit: 20,
        });
        find('#admin-order-list').replaceChildren(
          ...result.data.map((order) => {
            const row = copyTemplate('admin-order-template');
            fillText(row, {
              'order-number': order.id.slice(0, 8).toUpperCase(),
              'item-count': `${order.item_count} ${order.item_count === 1 ? 'item' : 'items'}`,
              'customer-name': order.customer.name,
              'customer-email': order.customer.email,
              'order-date': dateTime(order.created_at),
              'order-total': currency(order.total_amount),
              'order-status': orderStatusLabels[order.status],
              'order-address': `${order.delivery_address.city}, ${order.delivery_address.province}`,
            });
            for (const link of findAll('[data-order-link]', row))
              link.href = '/admin/orders/' + order.id;
            find('.order-status-badge', row).dataset.status = order.status;
            return row;
          }),
        );
        find('#empty-state').hidden = result.data.length !== 0;
        updatePagination(result.pagination);
      } catch (error) {
        showError(error);
      }
    }
    await load();
    watchAvailability(load);
  }
  showPage();
}
