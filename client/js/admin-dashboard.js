import { adminCatalogApi, adminOrderApi, adminUserApi } from './api.js';
import { pageReady, showPage } from './common.js';
import {
  currency,
  dateTime,
  fillText,
  find,
  showError,
  showNotice,
  watchAvailability,
} from './helpers.js';
import { orderStatusLabels } from './order-status.js';
import { formatPaymentMethod } from './payment-simulation.js';

const periodLabels = {
  all: 'All time',
  '30d': 'Last 30 days',
  '7d': 'Last 7 days',
  today: 'Today',
};

const statusConfig = [
  { key: 'pending', label: 'Pending review', tone: 'warning' },
  { key: 'processing', label: 'Processing', tone: 'clay' },
  { key: 'paid', label: 'Paid', tone: 'clay' },
  { key: 'shipped', label: 'Shipped', tone: 'brand' },
  { key: 'delivered', label: 'Delivered', tone: 'success' },
  { key: 'cancelled', label: 'Cancelled', tone: 'danger' },
  { key: 'refunded', label: 'Refunded', tone: 'danger' },
];

function createEl(tag, className = '', text = '') {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== '') element.textContent = text;
  return element;
}

function createProgressBar(percent, tone = 'brand') {
  const track = createEl('div', 'analytics-bar-track mt-2');
  const fill = createEl('div', 'analytics-bar-fill');
  fill.dataset.tone = tone;
  fill.style.width = `${Math.max(0, Math.min(100, Math.round(percent)))}%`;
  track.append(fill);
  return track;
}

function filterOrdersByPeriod(orders, period) {
  if (period === 'all') return orders;
  const now = Date.now();
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const cutoff =
    period === 'today'
      ? startOfToday.getTime()
      : period === '7d'
        ? now - 7 * 24 * 60 * 60 * 1000
        : now - 30 * 24 * 60 * 60 * 1000;
  return orders.filter((order) => {
    const timestamp = new Date(order.created_at).getTime();
    return !Number.isNaN(timestamp) && timestamp >= cutoff;
  });
}

if (await pageReady) {
  const periodSelect = find('#analytics-period');
  let rawOrders = [];
  let rawProducts = [];
  let rawCategories = [];
  let rawUsers = [];
  let totalUserCount = 0;

  function render() {
    const period = periodSelect?.value || 'all';
    const filteredOrders = filterOrdersByPeriod(rawOrders, period);
    const activeOrders = filteredOrders.filter(
      (order) => order.status !== 'cancelled' && order.status !== 'refunded',
    );
    const grossRevenue = activeOrders.reduce(
      (sum, order) => sum + Number(order.total_amount || 0),
      0,
    );
    const averageOrderValue = activeOrders.length
      ? grossRevenue / activeOrders.length
      : 0;
    const deliveredCount = filteredOrders.filter(
      (order) => order.status === 'delivered',
    ).length;
    const awaitingActionCount = filteredOrders.filter((order) =>
      ['pending', 'processing', 'paid'].includes(order.status),
    ).length;
    const fulfillmentRate = filteredOrders.length
      ? Math.round((deliveredCount / filteredOrders.length) * 100)
      : 0;

    const activeProducts = rawProducts.filter((product) => product.is_active);
    const totalStockUnits = rawProducts.reduce(
      (sum, product) => sum + Number(product.stock_quantity || 0),
      0,
    );
    const totalInventoryValue = rawProducts.reduce(
      (sum, product) =>
        sum + Number(product.price || 0) * Number(product.stock_quantity || 0),
      0,
    );

    const customerCount = rawUsers.filter((user) => user.role === 'customer').length;
    const teamCount = rawUsers.filter(
      (user) => user.role === 'admin' || user.role === 'staff',
    ).length;

    fillText(document, {
      'pipeline-period-label': periodLabels[period] ?? 'All time',
      'kpi-revenue': currency(grossRevenue),
      'kpi-aov': `Avg. order value ${currency(averageOrderValue)} · ${activeOrders.length} active ${activeOrders.length === 1 ? 'order' : 'orders'}`,
      'kpi-orders': `${filteredOrders.length} ${filteredOrders.length === 1 ? 'order' : 'orders'}`,
      'kpi-fulfillment': `${fulfillmentRate}% delivered · ${awaitingActionCount} awaiting fulfillment`,
      'kpi-inventory-value': currency(totalInventoryValue),
      'kpi-catalog-summary': `${activeProducts.length} active of ${rawProducts.length} products · ${totalStockUnits} units`,
      'kpi-users': `${totalUserCount || rawUsers.length} accounts`,
      'kpi-users-summary': `${customerCount} customers · ${teamCount} staff & admins`,
      'report-period-summary': `${periodLabels[period] ?? 'All time'} · ${filteredOrders.length} ${filteredOrders.length === 1 ? 'order' : 'orders'} · ${currency(grossRevenue)} net revenue`,
    });

    // 1. Fulfillment Pipeline Breakdown
    const statusList = find('#analytics-status-list');
    const statusRows = statusConfig.map(({ key, label, tone }) => {
      const matching = filteredOrders.filter((order) => order.status === key);
      const statusTotal = matching.reduce(
        (sum, order) => sum + Number(order.total_amount || 0),
        0,
      );
      const share = filteredOrders.length
        ? (matching.length / filteredOrders.length) * 100
        : 0;

      const wrapper = createEl('div');
      const topRow = createEl(
        'div',
        'flex flex-wrap items-center justify-between gap-2 text-xs',
      );
      const leftLabel = createEl('span', 'font-semibold text-text', label);
      const rightLabel = createEl(
        'span',
        'text-text-muted',
        `${matching.length} (${Math.round(share)}%) · ${currency(statusTotal)}`,
      );
      topRow.append(leftLabel, rightLabel);
      wrapper.append(topRow, createProgressBar(share, tone));
      return wrapper;
    });
    statusList.replaceChildren(...statusRows);

    // 2. Payment Method Mix
    const paymentList = find('#analytics-payment-list');
    const paymentMethods = ['cash_on_delivery', 'gcash', 'maya'];
    const paymentRows = paymentMethods.map((method) => {
      const matching = activeOrders.filter(
        (order) => (order.payment_method || 'cash_on_delivery') === method,
      );
      const methodRevenue = matching.reduce(
        (sum, order) => sum + Number(order.total_amount || 0),
        0,
      );
      const share = grossRevenue > 0 ? (methodRevenue / grossRevenue) * 100 : 0;

      const row = createEl('div');
      const header = createEl(
        'div',
        'flex flex-wrap items-center justify-between gap-2 text-xs',
      );
      header.append(
        createEl('span', 'font-semibold text-text', formatPaymentMethod(method)),
        createEl(
          'span',
          'text-text-muted',
          `${currency(methodRevenue)} · ${matching.length} ${matching.length === 1 ? 'order' : 'orders'} (${Math.round(share)}%)`,
        ),
      );
      row.append(header, createProgressBar(share, 'brand'));
      return row;
    });
    paymentList.replaceChildren(...paymentRows);

    // 3. Collection Valuation & Stock Report
    const categoryList = find('#analytics-category-list');
    const categoryRows = rawCategories.map((category) => {
      const catProducts = rawProducts.filter(
        (product) => product.category?.id === category.id,
      );
      const catUnits = catProducts.reduce(
        (sum, product) => sum + Number(product.stock_quantity || 0),
        0,
      );
      const catValue = catProducts.reduce(
        (sum, product) =>
          sum + Number(product.price || 0) * Number(product.stock_quantity || 0),
        0,
      );
      const share =
        totalInventoryValue > 0 ? (catValue / totalInventoryValue) * 100 : 0;

      const card = createEl(
        'div',
        'rounded-control border border-border bg-surface-muted/60 p-4',
      );
      const top = createEl('div', 'flex flex-wrap items-start justify-between gap-2');
      const titleGroup = createEl('div', 'min-w-0');
      titleGroup.append(
        createEl('p', 'font-display text-2xl text-floral-pink', category.name),
        createEl(
          'p',
          'mt-0.5 text-xs text-text-muted',
          `${category.active_product_count ?? catProducts.filter((p) => p.is_active).length} active / ${category.product_count ?? catProducts.length} total products · ${catUnits} units in stock`,
        ),
      );
      const valueBadge = createEl(
        'div',
        'text-right',
        `${currency(catValue)} (${Math.round(share)}%)`,
      );
      valueBadge.className = 'text-xs font-bold text-floral-pink';
      top.append(titleGroup, valueBadge);
      card.append(top, createProgressBar(share, 'success'));
      return card;
    });
    categoryList.replaceChildren(
      ...(categoryRows.length
        ? categoryRows
        : [
            createEl(
              'p',
              'text-sm text-text-muted',
              'No collections available to report.',
            ),
          ]),
    );

    // 4. Automated Store Insights & Recommendations
    const insightsList = find('#analytics-insights-list');
    const outOfStock = rawProducts.filter(
      (product) => product.is_active && Number(product.stock_quantity) <= 0,
    );
    const lowStock = rawProducts.filter(
      (product) =>
        product.is_active &&
        Number(product.stock_quantity) > 0 &&
        Number(product.stock_quantity) <= 5,
    );
    const featuredActive = activeProducts.filter((product) => product.featured);

    const insights = [
      {
        badge: awaitingActionCount > 0 ? 'Fulfillment priority' : 'Fulfillment healthy',
        title:
          awaitingActionCount > 0
            ? `${awaitingActionCount} ${awaitingActionCount === 1 ? 'order requires' : 'orders require'} fulfillment progression`
            : 'All active customer orders are shipped or delivered',
        detail:
          awaitingActionCount > 0
            ? `Review pending and paid orders to maintain fast dispatch times. Current delivery completion rate is ${fulfillmentRate}%.`
            : `Order pipeline is clear with a ${fulfillmentRate}% delivery completion rate in the selected period.`,
        href: '/admin/orders',
        linkText: 'Open order queue →',
      },
      {
        badge:
          outOfStock.length > 0 || lowStock.length > 0
            ? 'Restock alert'
            : 'Stock optimal',
        title:
          outOfStock.length > 0 || lowStock.length > 0
            ? `${outOfStock.length} out of stock · ${lowStock.length} low-stock ${lowStock.length === 1 ? 'item' : 'items'}`
            : 'All active catalog products have healthy stock reserves',
        detail:
          outOfStock.length > 0 || lowStock.length > 0
            ? 'Replenish depleted SKUs to prevent missed storefront conversions.'
            : `Total catalog holds ${totalStockUnits} units valued at ${currency(totalInventoryValue)}.`,
        href: '/admin/products?sort=stock-asc',
        linkText: 'Review inventory →',
      },
      {
        badge: 'Revenue intelligence',
        title: `${currency(grossRevenue)} gross revenue across ${activeOrders.length} active ${activeOrders.length === 1 ? 'order' : 'orders'}`,
        detail: `Average basket size is ${currency(averageOrderValue)}. Offering curated botanical bundles can help lift order values above ${currency(Math.max(1500, Math.ceil(averageOrderValue * 1.15)))}.`,
        href: '/admin/orders',
        linkText: 'Inspect order values →',
      },
      {
        badge: 'Merchandising insight',
        title: `${featuredActive.length} of ${activeProducts.length} active products featured on Home`,
        detail:
          'Rotating seasonal flowers and high-margin botanical perfumes in featured slots keeps repeat visitors engaged.',
        href: '/admin/products',
        linkText: 'Curate featured items →',
      },
    ];

    insightsList.replaceChildren(
      ...insights.map((item) => {
        const li = createEl(
          'li',
          'rounded-control border border-border bg-surface-muted/60 p-4',
        );
        const badge = createEl('p', 'eyebrow text-clay', item.badge);
        const title = createEl(
          'p',
          'mt-1 text-sm font-bold text-floral-pink',
          item.title,
        );
        const detail = createEl(
          'p',
          'mt-1 text-xs leading-5 text-text-muted',
          item.detail,
        );
        const link = createEl(
          'a',
          'mt-2.5 inline-block text-xs font-bold text-floral-pink underline-offset-4 hover:underline',
          item.linkText,
        );
        link.href = item.href;
        li.append(badge, title, detail, link);
        return li;
      }),
    );

    // 5. Low-Stock & Restock Watchlist Report
    const watchlistContainer = find('#analytics-low-stock-list');
    const watchlistProducts = [...rawProducts]
      .filter((product) => Number(product.stock_quantity) <= 10)
      .sort((a, b) => Number(a.stock_quantity) - Number(b.stock_quantity))
      .slice(0, 6);

    if (watchlistProducts.length === 0) {
      watchlistContainer.replaceChildren(
        createEl(
          'p',
          'py-6 text-sm text-text-muted',
          'All catalog products currently have more than 10 units in stock.',
        ),
      );
    } else {
      watchlistContainer.replaceChildren(
        ...watchlistProducts.map((product) => {
          const row = createEl(
            'div',
            'flex flex-wrap items-center justify-between gap-3 py-3.5',
          );
          const info = createEl('div', 'min-w-0');
          info.append(
            createEl('p', 'font-semibold text-floral-pink', product.name),
            createEl(
              'p',
              'mt-0.5 text-xs text-text-muted',
              `${product.sku} · ${product.category?.name ?? 'Catalog'} · ${currency(product.price)}`,
            ),
          );
          const right = createEl('div', 'flex items-center gap-3');
          const qty = Number(product.stock_quantity);
          const pill = createEl(
            'span',
            'rounded-full bg-surface-muted px-3 py-1 text-xs font-bold text-floral-pink',
            qty <= 0 ? 'Out of stock' : `${qty} left`,
          );
          const actionLink = createEl(
            'a',
            'text-xs font-bold text-floral-pink underline-offset-4 hover:underline',
            'Restock',
          );
          actionLink.href = `/admin/products?search=${encodeURIComponent(product.sku)}`;
          right.append(pill, actionLink);
          row.append(info, right);
          return row;
        }),
      );
    }

    // 6. Recent Orders Financial Ledger Report
    const recentContainer = find('#analytics-recent-orders');
    const recentOrders = filteredOrders.slice(0, 8);
    if (recentOrders.length === 0) {
      recentContainer.replaceChildren(
        createEl(
          'p',
          'px-6 py-8 text-center text-sm text-text-muted',
          'No orders recorded in this reporting window.',
        ),
      );
    } else {
      recentContainer.replaceChildren(
        ...recentOrders.map((order) => {
          const row = createEl(
            'div',
            'flex flex-wrap items-center justify-between gap-4 px-6 py-4',
          );
          const left = createEl('div', 'min-w-0');
          const orderLink = createEl(
            'a',
            'font-semibold text-floral-pink underline-offset-4 hover:underline',
            `Order #${order.id.slice(0, 8)} · ${order.customer?.name ?? 'Customer'}`,
          );
          orderLink.href = `/admin/orders/${order.id}`;
          const meta = createEl(
            'p',
            'mt-1 text-xs text-text-muted',
            `${dateTime(order.created_at)} · ${order.item_count} ${order.item_count === 1 ? 'item' : 'items'} · ${formatPaymentMethod(order.payment_method)}`,
          );
          left.append(orderLink, meta);

          const right = createEl('div', 'flex flex-wrap items-center gap-3');
          const statusPill = createEl(
            'span',
            'order-status-pill',
            orderStatusLabels[order.status] ?? order.status,
          );
          statusPill.dataset.status = order.status;
          const amount = createEl(
            'strong',
            'text-sm font-bold text-floral-pink',
            currency(order.total_amount),
          );
          right.append(statusPill, amount);
          row.append(left, right);
          return row;
        }),
      );
    }
  }

  async function loadDashboard(announce = false) {
    showError(null);
    try {
      const [ordersResult, productsResult, categoriesResult, usersResult] =
        await Promise.all([
          adminOrderApi.getOrders({ limit: 100 }),
          adminCatalogApi.getProducts({ limit: 100, status: 'all' }),
          adminCatalogApi.getCategories(),
          adminUserApi.getUsers({ limit: 100 }),
        ]);
      rawOrders = ordersResult.data ?? [];
      rawProducts = productsResult.data ?? [];
      rawCategories = categoriesResult.data ?? [];
      rawUsers = usersResult.data ?? [];
      totalUserCount = usersResult.pagination?.total ?? rawUsers.length;
      render();
      if (announce) showNotice('Analytics and reports refreshed.');
    } catch (error) {
      showError(error);
    } finally {
      showPage();
    }
  }

  function exportCsvReport() {
    const period = periodSelect?.value || 'all';
    const filteredOrders = filterOrdersByPeriod(rawOrders, period);
    const headers = [
      'Order ID',
      'Created At',
      'Customer Name',
      'Customer Email',
      'Status',
      'Payment Method',
      'Item Count',
      'Total Amount (PHP)',
    ];
    const escapeCsv = (value) => {
      const text = String(value ?? '');
      return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    };
    const lines = [
      headers.join(','),
      ...filteredOrders.map((order) =>
        [
          order.id,
          order.created_at,
          order.customer?.name ?? '',
          order.customer?.email ?? '',
          order.status,
          formatPaymentMethod(order.payment_method),
          order.item_count,
          order.total_amount,
        ]
          .map(escapeCsv)
          .join(','),
      ),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `florea-haven-report-${period}.csv`;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    showNotice('Analytics report exported as CSV.');
  }

  periodSelect?.addEventListener('change', () => render());
  find('[data-refresh-dashboard]')?.addEventListener('click', () => {
    void loadDashboard(true);
  });
  find('[data-export-csv]')?.addEventListener('click', exportCsvReport);

  await loadDashboard();
  watchAvailability(() => loadDashboard(false));
}
