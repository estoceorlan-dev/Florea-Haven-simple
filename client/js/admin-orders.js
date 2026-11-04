import { adminOrderApi } from './api.js';
import { pageReady, refreshAdminOrdersBadge, showPage } from './common.js';
import {
  find,
  findAll,
  fillText,
  copyTemplate,
  currency,
  dateTime,
  setImage,
  showError,
  showNotice,
  confirmAction,
  watchAvailability,
} from './helpers.js';
import {
  allowedOrderTransitions,
  openProcessOrderDialog,
  orderStatusLabels,
  showOrderToast,
} from './order-status.js';
import { fillOrderDetails, resolveOrderPreviewImage } from './orders.js';
import { enableFilters, updatePagination } from './admin-helpers.js';

function notifyAdminAction(updated) {
  const code = updated.id.slice(0, 8).toUpperCase();
  showNotice(`Order status updated to ${updated.status}.`);
  void refreshAdminOrdersBadge();
  showOrderToast({
    title: `Order #${code} · ${orderStatusLabels[updated.status] ?? updated.status}`,
    message:
      updated.status_note ||
      `Customer ${updated.customer?.name ?? ''} has been notified of this ${updated.status} update.`,
    courier: updated.courier_name ?? '',
    eta: updated.estimated_delivery ?? '',
    tone:
      updated.status === 'cancelled'
        ? 'danger'
        : updated.status === 'refunded'
          ? 'refund'
          : 'info',
  });
}

if (await pageReady) {
  if (document.body.dataset.page === 'admin-order') {
    const id =
      /^\/admin\/orders\/([^/]+)/.exec(location.pathname)?.[1] ??
      new URLSearchParams(location.search).get('id');
    let busy = false;
    let currentOrder = null;

    function render(order) {
      currentOrder = order;
      fillOrderDetails(order);
      fillText(document, {
        'customer-name': order.customer.name,
        'customer-email': order.customer.email,
      });
      find('[data-customer-email]').href = 'mailto:' + order.customer.email;
      const allowed = allowedOrderTransitions[order.status] ?? [];
      for (const button of findAll('[data-order-status]')) {
        button.hidden = !allowed.includes(button.dataset.orderStatus);
      }
      const processBtn = find('[data-order-process]');
      if (processBtn) {
        processBtn.hidden = !allowed.some((status) =>
          ['confirmed', 'preparing', 'shipped'].includes(status),
        );
      }
    }

    async function load() {
      if (busy) return;
      try {
        render((await adminOrderApi.getOrder(id)).data);
      } catch (error) {
        showError(error);
      }
    }

    async function applyStatusUpdate(status, details = {}) {
      busy = true;
      for (const action of findAll('[data-order-status], [data-order-process]')) {
        action.disabled = true;
      }
      try {
        const result = await adminOrderApi.updateStatus(id, status, details);
        render(result.data);
        notifyAdminAction(result.data);
        showError(null);
      } finally {
        busy = false;
        for (const action of findAll('[data-order-status], [data-order-process]')) {
          action.disabled = false;
        }
      }
    }

    find('#order-actions').addEventListener('click', (event) => {
      if (busy || !currentOrder) return;
      const processTrigger = event.target.closest('[data-order-process]');
      if (processTrigger) {
        openProcessOrderDialog({
          order: currentOrder,
          trigger: processTrigger,
          onSubmit: async ({ status, ...details }) => {
            await applyStatusUpdate(status, details);
          },
        });
        return;
      }

      const button = event.target.closest('[data-order-status]');
      if (!button) return;
      const status = button.dataset.orderStatus;

      if (status === 'cancelled') {
        confirmAction({
          title: 'Cancel this order?',
          description:
            'Every item will be returned to inventory. The order remains in the customer’s history and a cancellation notification will be sent.',
          label: 'Cancel order',
          trigger: button,
          action: () => applyStatusUpdate('cancelled'),
        });
      } else if (status === 'refunded') {
        confirmAction({
          title: 'Refund this order?',
          description: `Issue a refund of ${currency(currentOrder.total_amount)} to ${currentOrder.customer.name}? Items will be restored to stock if not already cancelled, and the customer will be notified.`,
          label: 'Confirm refund',
          trigger: button,
          action: () => applyStatusUpdate('refunded'),
        });
      } else {
        void applyStatusUpdate(status).catch(showError);
      }
    });

    await load();
    watchAvailability(load);
  } else {
    enableFilters();
    let ordersById = new Map();

    async function load() {
      try {
        const result = await adminOrderApi.getOrders({
          ...Object.fromEntries(new URLSearchParams(location.search)),
          limit: 20,
        });
        ordersById = new Map(result.data.map((order) => [order.id, order]));
        const previews = await Promise.all(
          result.data.map((order) => resolveOrderPreviewImage(order)),
        );
        find('#admin-order-list').replaceChildren(
          ...result.data.map((order, idx) => {
            const row = copyTemplate('admin-order-template');
            row.dataset.orderId = order.id;
            const productTitle = order.preview_product_name || 'Botanical Arrangement';
            fillText(row, {
              'order-product': productTitle,
              'order-number': order.id.slice(0, 8).toUpperCase(),
              'item-count': `${order.item_count} ${order.item_count === 1 ? 'item' : 'items'}`,
              'customer-name': order.customer.name,
              'customer-email': order.customer.email,
              'order-date': dateTime(order.created_at),
              'order-total': currency(order.total_amount),
              'order-status': orderStatusLabels[order.status] ?? order.status,
              'order-address': `${order.delivery_address.city}, ${order.delivery_address.province}`,
            });
            setImage(row, 'order-image', previews[idx], productTitle);

            const courierEl = find('[data-field="order-courier"]', row);
            if (courierEl) {
              courierEl.textContent = order.courier_name
                ? `${order.courier_name}${order.tracking_number ? ` · ${order.tracking_number}` : ''}`
                : '';
              courierEl.hidden = !order.courier_name;
            }
            const etaEl = find('[data-field="order-eta"]', row);
            if (etaEl) {
              etaEl.textContent = order.estimated_delivery
                ? `ETA: ${order.estimated_delivery}`
                : '';
              etaEl.hidden = !order.estimated_delivery;
            }

            const allowed = allowedOrderTransitions[order.status] ?? [];
            const processBtn = find('[data-row-action="process"]', row);
            if (processBtn) {
              processBtn.hidden = !allowed.some((status) =>
                ['confirmed', 'preparing', 'shipped'].includes(status),
              );
            }
            const deliverBtn = find('[data-row-action="delivered"]', row);
            if (deliverBtn) {
              deliverBtn.hidden =
                order.status !== 'shipped' || !allowed.includes('delivered');
            }
            const cancelBtn = find('[data-row-action="cancel"]', row);
            if (cancelBtn) {
              cancelBtn.hidden = !allowed.includes('cancelled');
            }
            const refundBtn = find('[data-row-action="refund"]', row);
            if (refundBtn) {
              refundBtn.hidden = !allowed.includes('refunded');
            }

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

    find('#admin-order-list').addEventListener('click', (event) => {
      const actionBtn = event.target.closest('[data-row-action]');
      if (!actionBtn) return;
      const row = actionBtn.closest('[data-order-row]');
      const order = ordersById.get(row?.dataset.orderId);
      if (!order) return;
      const action = actionBtn.dataset.rowAction;
      const code = order.id.slice(0, 8).toUpperCase();

      async function runRowUpdate(status, details = {}) {
        const result = await adminOrderApi.updateStatus(order.id, status, details);
        notifyAdminAction(result.data);
        showError(null);
        await load();
      }

      if (action === 'process') {
        openProcessOrderDialog({
          order,
          trigger: actionBtn,
          onSubmit: async ({ status, ...details }) => {
            await runRowUpdate(status, details);
          },
        });
      } else if (action === 'delivered') {
        actionBtn.disabled = true;
        void runRowUpdate('delivered')
          .catch(showError)
          .finally(() => {
            actionBtn.disabled = false;
          });
      } else if (action === 'cancel') {
        confirmAction({
          title: `Cancel Order #${code}?`,
          description: `Cancel ${order.customer.name}’s order and return all reserved items to stock? The customer will receive a cancellation notification.`,
          label: 'Cancel order',
          trigger: actionBtn,
          action: () => runRowUpdate('cancelled'),
        });
      } else if (action === 'refund') {
        confirmAction({
          title: `Refund Order #${code}?`,
          description: `Issue a refund of ${currency(order.total_amount)} to ${order.customer.name}? Items will be restored to stock if not already cancelled, and the customer will receive a refund notification.`,
          label: 'Confirm refund',
          trigger: actionBtn,
          action: () => runRowUpdate('refunded'),
        });
      }
    });

    await load();
    watchAvailability(load);
  }
  showPage();
}
