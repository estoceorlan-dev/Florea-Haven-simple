import { orderApi } from './api.js';
import {
  getDismissedNotificationsMap,
  markNotificationRead,
  pageReady,
  showPage,
  updateNotificationBellBadge,
} from './common.js';
import { getDemoProductImage } from './demo-images.js';
import {
  find,
  findAll,
  fillText,
  copyTemplate,
  currency,
  dateTime,
  setImage,
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

const CATEGORY_FALLBACK_IMAGES = {
  flowers:
    'https://images.unsplash.com/photo-1490750967868-88aa4486c946?auto=format&fit=crop&w=1200&q=85',
  seeds:
    'https://images.unsplash.com/photo-1416879595882-3373a0480b5b?auto=format&fit=crop&w=1200&q=85',
  perfumes:
    'https://images.unsplash.com/photo-1541643600914-78b084683601?auto=format&fit=crop&w=1200&q=85',
};

const ORDER_SECTIONS = [
  {
    key: 'pending',
    label: 'Pending',
    match: (order) => order.status === 'pending',
  },
  {
    key: 'on_delivery',
    label: 'On delivery',
    match: (order) => ['confirmed', 'preparing', 'shipped'].includes(order.status),
  },
  {
    key: 'received',
    label: 'Received',
    match: (order) => order.status === 'delivered',
  },
  {
    key: 'cancelled',
    label: 'Cancelled',
    match: (order) => ['cancelled', 'refunded'].includes(order.status),
  },
];

function formatOrderProductTitle(order) {
  const baseName = order.preview_product_name || 'Botanical Arrangement';
  const count = Number(order.item_count) || 1;
  return count > 1 ? `${baseName} · ${count} items` : baseName;
}

export async function resolveOrderPreviewImage(order) {
  if (order.preview_image_url) return order.preview_image_url;
  if (order.preview_product_id) {
    try {
      const demo = await getDemoProductImage(order.preview_product_id);
      if (demo) return demo;
    } catch {
      /* Ignore IndexedDB errors */
    }
  }
  return (
    CATEGORY_FALLBACK_IMAGES[order.preview_category_slug] || '/image-placeholder.svg'
  );
}

async function resolveOrderItemImage(item, order) {
  if (item.image_url) return item.image_url;
  if (item.product_id) {
    try {
      const demo = await getDemoProductImage(item.product_id);
      if (demo) return demo;
    } catch {
      /* Ignore IndexedDB errors */
    }
  }
  const slug = item.category_slug || order.preview_category_slug;
  return (
    CATEGORY_FALLBACK_IMAGES[slug] ||
    order.preview_image_url ||
    '/image-placeholder.svg'
  );
}

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
    'order-heading': 'Order #' + order.id.slice(0, 8).toUpperCase(),
    'order-number': 'Order #' + order.id.slice(0, 8).toUpperCase(),
    'order-date': 'Placed ' + dateTime(order.created_at),
    'order-status': orderStatusLabels[order.status] ?? order.status,
    'order-subtotal': currency(order.subtotal),
    'order-total': currency(order.total_amount),
    'payment-method': paymentMethodLabels[order.payment_method] ?? 'Cash on Delivery',
    'status-date': 'Status updated ' + dateTime(order.status_updated_at),
    'confirmation-message': `We received order #${order.id.slice(0, 8).toUpperCase()}. Its purchase details are saved in your order history.`,
    'courier-name': order.courier_name || 'Awaiting courier assignment',
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
      const imgEl = find('[data-field="item-image"]', row);
      if (imgEl) {
        const immediateUrl =
          item.image_url ||
          CATEGORY_FALLBACK_IMAGES[item.category_slug || order.preview_category_slug] ||
          order.preview_image_url ||
          '/image-placeholder.svg';
        setImage(imgEl, immediateUrl, item.product_name);
        void resolveOrderItemImage(item, order).then((resolvedUrl) => {
          if (resolvedUrl) setImage(imgEl, resolvedUrl, item.product_name);
        });
      }
      return row;
    }),
  );
}

function buildOrderCatalogCard(order, previewUrl) {
  const row = copyTemplate('order-card-template');
  const productTitle = formatOrderProductTitle(order);
  fillText(row, {
    'order-product-name': productTitle,
    'order-summary': `${dateTime(order.created_at)} · ${order.item_count} ${order.item_count === 1 ? 'item' : 'items'}`,
    'order-status': orderStatusLabels[order.status] ?? order.status,
    'order-total': currency(order.total_amount),
  });
  const imageEl = find('[data-field="order-image"]', row);
  if (imageEl) setImage(imageEl, previewUrl, productTitle);

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
  for (const link of findAll('[data-order-link]', row)) {
    link.href = '/orders/' + order.id;
  }
  return row;
}

if (
  ['orders', 'order', 'order-confirmation', 'notifications'].includes(
    document.body.dataset.page,
  ) &&
  (await pageReady)
) {
  const page = document.body.dataset.page;
  if (page === 'orders') {
    let activeTab = 'all';
    let cachedOrders = [];

    function renderOrdersBySection() {
      const listContainer = find('#order-list');
      const emptyState = find('#empty-state');
      if (!listContainer) return;

      for (const tabBtn of findAll('[data-order-tab]')) {
        const key = tabBtn.dataset.orderTab;
        tabBtn.setAttribute('aria-pressed', String(key === activeTab));
      }

      const countAll = find('[data-tab-count="all"]');
      if (countAll) countAll.textContent = String(cachedOrders.length);
      for (const section of ORDER_SECTIONS) {
        const countEl = find(`[data-tab-count="${section.key}"]`);
        if (countEl) {
          countEl.textContent = String(
            cachedOrders.filter(({ order }) => section.match(order)).length,
          );
        }
      }

      const sectionsToRender =
        activeTab === 'all'
          ? ORDER_SECTIONS
          : ORDER_SECTIONS.filter((section) => section.key === activeTab);

      const blocks = [];
      for (const section of sectionsToRender) {
        const matching = cachedOrders.filter(({ order }) => section.match(order));
        if (matching.length === 0) continue;

        const sectionBlock = document.createElement('section');
        sectionBlock.className = 'order-section-block';
        sectionBlock.dataset.orderSection = section.key;

        const header = document.createElement('div');
        header.className = 'order-section-header';

        const title = document.createElement('h2');
        title.className = 'order-section-title';
        title.textContent = section.label;

        const countBadge = document.createElement('span');
        countBadge.className = 'order-tab-count';
        countBadge.textContent = String(matching.length);

        const divider = document.createElement('span');
        divider.className = 'order-section-divider';
        divider.setAttribute('aria-hidden', 'true');

        header.append(title, countBadge, divider);

        const grid = document.createElement('div');
        grid.className = 'order-catalog-grid';
        grid.append(
          ...matching.map(({ order, previewUrl }) =>
            buildOrderCatalogCard(order, previewUrl),
          ),
        );

        sectionBlock.append(header, grid);
        blocks.push(sectionBlock);
      }

      listContainer.replaceChildren(...blocks);
      if (emptyState) emptyState.hidden = blocks.length !== 0;
    }

    const tabsNav = find('#order-section-tabs');
    if (tabsNav) {
      tabsNav.addEventListener('click', (event) => {
        const button = event.target.closest('[data-order-tab]');
        if (!button) return;
        activeTab = button.dataset.orderTab;
        renderOrdersBySection();
      });
    }

    async function load() {
      try {
        const result = await orderApi.getOrders({
          ...Object.fromEntries(new URLSearchParams(location.search)),
          limit: 48,
        });
        updateNotificationBellBadge(result.data);
        cachedOrders = await Promise.all(
          result.data.map(async (order) => ({
            order,
            previewUrl: await resolveOrderPreviewImage(order),
          })),
        );
        renderOrdersBySection();
        updatePagination(result.pagination);
        showError(null);
      } catch (error) {
        showError(error);
      }
    }
    await load();
    watchAvailability(load);
  } else if (page === 'notifications') {
    let loadedOrders = [];

    async function renderNotifications() {
      const list = find('#notification-list');
      const empty = find('#empty-state');
      const markAllBtn = find('#mark-all-notifications-read');
      if (!list) return;

      const dismissed = getDismissedNotificationsMap();
      const unreadCount = updateNotificationBellBadge(loadedOrders);
      if (markAllBtn) markAllBtn.hidden = unreadCount === 0;

      const items = await Promise.all(
        loadedOrders.map(async (order) => {
          const card = copyTemplate('notification-card-template');
          const signature = `${order.status}|${order.status_updated_at ?? ''}`;
          const isUnread = dismissed[order.id] !== signature;
          card.dataset.unread = String(isUnread);

          const productTitle = formatOrderProductTitle(order);
          const previewUrl = await resolveOrderPreviewImage(order);
          const imageEl = find('[data-field="notification-image"]', card);
          if (imageEl) setImage(imageEl, previewUrl, productTitle);

          const dot = find('[data-unread-indicator]', card);
          if (dot) dot.hidden = !isUnread;

          const message =
            order.status_note ||
            buildDefaultStatusNote(
              order.status,
              order.courier_name,
              order.tracking_number,
              order.estimated_delivery,
            ) ||
            'Your order has been received and is awaiting confirmation.';

          const metaLine = [
            order.courier_name ? `Courier: ${order.courier_name}` : '',
            order.tracking_number ? `Tracking: ${order.tracking_number}` : '',
            order.estimated_delivery
              ? `Estimated arrival: ${order.estimated_delivery}`
              : '',
          ]
            .filter(Boolean)
            .join(' · ');

          fillText(card, {
            'notification-title': productTitle,
            'order-status': orderStatusLabels[order.status] ?? order.status,
            'notification-message': message,
            'notification-meta': metaLine,
            'notification-date': `Updated ${dateTime(order.status_updated_at || order.created_at)}`,
          });

          const metaEl = find('[data-field="notification-meta"]', card);
          if (metaEl) metaEl.hidden = !metaLine;

          find('.order-status-badge', card).dataset.status = order.status;
          for (const link of findAll('[data-order-link]', card)) {
            link.href = '/orders/' + order.id;
          }

          const markReadBtn = find('[data-mark-read]', card);
          if (markReadBtn) {
            markReadBtn.hidden = !isUnread;
            markReadBtn.addEventListener('click', () => {
              markNotificationRead(order);
              void renderNotifications();
            });
          }
          return card;
        }),
      );

      list.replaceChildren(...items);
      if (empty) empty.hidden = items.length !== 0;
    }

    const markAllBtn = find('#mark-all-notifications-read');
    if (markAllBtn) {
      markAllBtn.addEventListener('click', () => {
        for (const order of loadedOrders) markNotificationRead(order);
        void renderNotifications();
      });
    }

    async function load() {
      try {
        const result = await orderApi.getOrders({ limit: 48 });
        loadedOrders = result.data ?? [];
        await renderNotifications();
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
            title: `${formatOrderProductTitle(order)} · ${orderStatusLabels[order.status] ?? order.status}`,
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
