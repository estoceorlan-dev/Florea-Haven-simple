import { orderApi } from './api.js';
import { currentUser, pageReady, showPage } from './common.js';
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
import {
  buildDefaultStatusNote,
  orderStatusLabels,
  showOrderToast,
} from './order-status.js';
import { paymentMethodLabels } from './payment-simulation.js';

export function fillOrderDetails(order) {
  const statusNote =
    order.status_note ||
    buildDefaultStatusNote(
      order.status,
      order.courier_name,
      order.tracking_number,
      order.estimated_delivery,
    ) ||
    'Your order has been received and is awaiting confirmation.';

  const etaDisplay =
    order.estimated_delivery ||
    (order.status === 'cancelled'
      ? 'Order cancelled'
      : order.status === 'refunded'
        ? 'Order refunded'
        : order.status === 'delivered'
          ? 'Delivered'
          : 'To be scheduled');

  fillText(document, {
    'order-heading': `Order ${order.id}`,
    'order-number': 'Order #' + order.id.slice(0, 8).toUpperCase(),
    'order-date': 'Placed ' + dateTime(order.created_at),
    'order-status': orderStatusLabels[order.status] ?? order.status,
    'order-subtotal': currency(order.subtotal),
    'order-total': currency(order.total_amount),
    'payment-method': paymentMethodLabels[order.payment_method] ?? 'Cash on Delivery',
    'status-date': 'Status updated ' + dateTime(order.status_updated_at),
    'confirmation-message': `We received order #${order.id.slice(0, 8).toUpperCase()}. Its purchase details are saved in your order history.`,
    'courier-name': order.courier_name
      ? `${order.courier_name} (Simulation)`
      : 'Awaiting courier assignment',
    'tracking-number': order.tracking_number || 'Pending dispatch',
    'estimated-delivery': etaDisplay,
    'status-note': statusNote,
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

function getDismissedOrderNotices() {
  const key = `florea-dismissed-order-notifs-${currentUser?.id ?? 'guest'}`;
  try {
    return JSON.parse(localStorage.getItem(key) || '{}');
  } catch {
    return {};
  }
}

function dismissOrderNotice(order) {
  const key = `florea-dismissed-order-notifs-${currentUser?.id ?? 'guest'}`;
  const dismissed = getDismissedOrderNotices();
  dismissed[order.id] = `${order.status}|${order.status_updated_at ?? ''}`;
  try {
    localStorage.setItem(key, JSON.stringify(dismissed));
  } catch {
    /* Ignore storage quota errors */
  }
}

function renderOrderUpdateBanners(orders) {
  const container = find('#order-updates-banner');
  if (!container) return;
  const dismissed = getDismissedOrderNotices();
  const activeOrders = orders.filter((order) => {
    if (order.status === 'pending' && !order.courier_name && !order.status_note)
      return false;
    const signature = `${order.status}|${order.status_updated_at ?? ''}`;
    return dismissed[order.id] !== signature;
  });

  if (activeOrders.length === 0) {
    container.hidden = true;
    container.replaceChildren();
    return;
  }

  container.hidden = false;
  container.replaceChildren(
    ...activeOrders.slice(0, 3).map((order) => {
      const card = document.createElement('aside');
      card.className =
        'order-fulfillment-card flex flex-wrap items-start justify-between gap-4';

      const content = document.createElement('div');
      content.className = 'min-w-0 flex-1 space-y-1';

      const eyebrow = document.createElement('p');
      eyebrow.className = 'eyebrow text-clay';
      eyebrow.textContent = `Order Update Notification · #${order.id.slice(0, 8).toUpperCase()}`;

      const title = document.createElement('p');
      title.className = 'font-display text-xl text-floral-pink';
      title.textContent = order.courier_name
        ? `${orderStatusLabels[order.status] ?? order.status} via ${order.courier_name}`
        : `Order is now ${orderStatusLabels[order.status] ?? order.status}`;

      const note = document.createElement('p');
      note.className = 'text-xs leading-5 text-text-muted';
      note.textContent =
        order.status_note ||
        buildDefaultStatusNote(
          order.status,
          order.courier_name,
          order.tracking_number,
          order.estimated_delivery,
        );

      content.append(eyebrow, title, note);

      if (order.courier_name || order.estimated_delivery || order.tracking_number) {
        const chips = document.createElement('div');
        chips.className = 'order-toast-meta pt-1';
        if (order.courier_name) {
          const c = document.createElement('span');
          c.className = 'order-meta-chip';
          c.textContent = `Courier: ${order.courier_name}`;
          chips.append(c);
        }
        if (order.tracking_number) {
          const t = document.createElement('span');
          t.className = 'order-meta-chip';
          t.textContent = `Tracking: ${order.tracking_number}`;
          chips.append(t);
        }
        if (order.estimated_delivery) {
          const e = document.createElement('span');
          e.className = 'order-meta-chip';
          e.textContent = `ETA: ${order.estimated_delivery}`;
          chips.append(e);
        }
        content.append(chips);
      }

      const actions = document.createElement('div');
      actions.className = 'flex items-center gap-2';
      const viewLink = document.createElement('a');
      viewLink.className = 'order-action-btn';
      viewLink.dataset.variant = 'process';
      viewLink.href = `/orders/${order.id}`;
      viewLink.textContent = 'Track order';

      const dismissBtn = document.createElement('button');
      dismissBtn.type = 'button';
      dismissBtn.className = 'order-action-btn';
      dismissBtn.textContent = 'Dismiss';
      dismissBtn.addEventListener('click', () => {
        dismissOrderNotice(order);
        card.remove();
        if (!container.children.length) container.hidden = true;
      });

      actions.append(viewLink, dismissBtn);
      card.append(content, actions);
      return card;
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
        renderOrderUpdateBanners(result.data);
        find('#order-list').replaceChildren(
          ...result.data.map((order) => {
            const row = copyTemplate('order-card-template');
            fillText(row, {
              'order-number': 'Order #' + order.id.slice(0, 8).toUpperCase(),
              'order-summary': `${dateTime(order.created_at)} · ${order.item_count} items · ${currency(order.total_amount)}`,
              'order-status': orderStatusLabels[order.status] ?? order.status,
            });
            const fulfillmentLine = [
              order.courier_name ? `Courier: ${order.courier_name}` : '',
              order.tracking_number ? `Tracking: ${order.tracking_number}` : '',
              order.estimated_delivery ? `ETA: ${order.estimated_delivery}` : '',
            ]
              .filter(Boolean)
              .join(' · ');
            const fulfillmentEl = find('[data-field="order-fulfillment"]', row);
            if (fulfillmentEl) {
              fulfillmentEl.textContent = fulfillmentLine;
              fulfillmentEl.hidden = !fulfillmentLine;
            }
            const noteText =
              order.status_note ||
              (order.status !== 'pending'
                ? buildDefaultStatusNote(
                    order.status,
                    order.courier_name,
                    order.tracking_number,
                    order.estimated_delivery,
                  )
                : '');
            const noteEl = find('[data-field="order-note"]', row);
            if (noteEl) {
              noteEl.textContent = noteText;
              noteEl.hidden = !noteText;
            }
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
    let previousSignature = null;
    async function load() {
      try {
        const order = (await orderApi.getOrder(id)).data;
        const signature = `${order.status}|${order.status_updated_at ?? ''}|${order.courier_name ?? ''}|${order.estimated_delivery ?? ''}`;
        if (previousSignature && previousSignature !== signature) {
          showOrderToast({
            title: `Order #${order.id.slice(0, 8).toUpperCase()} · ${orderStatusLabels[order.status] ?? order.status}`,
            message:
              order.status_note ||
              buildDefaultStatusNote(
                order.status,
                order.courier_name,
                order.tracking_number,
                order.estimated_delivery,
              ),
            courier: order.courier_name ?? '',
            eta: order.estimated_delivery ?? '',
            tone:
              order.status === 'cancelled'
                ? 'danger'
                : order.status === 'refunded'
                  ? 'refund'
                  : 'info',
          });
        }
        previousSignature = signature;
        fillOrderDetails(order);
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
