import { adminCatalogApi, adminOrderApi, adminUserApi } from './api.js';
import { pageReady, showPage } from './common.js';
import {
  currency,
  dateTime,
  fillText,
  find,
  findAll,
  showError,
  showNotice,
  watchAvailability,
} from './helpers.js';
import { orderStatusLabels } from './order-status.js';
import { paymentMethodLabels } from './payment-simulation.js';

const formatPaymentMethod = (method) =>
  paymentMethodLabels[method] ?? method ?? 'Cash on Delivery';

const periodLabels = {
  all: 'All time',
  '30d': 'Last 30 days',
  '7d': 'Last 7 days',
  today: 'Today',
};

const statusConfig = [
  { key: 'pending', label: 'Pending review', tone: 'warning', color: '#b7791f' },
  { key: 'confirmed', label: 'Confirmed', tone: 'accent', color: '#b56576' },
  { key: 'preparing', label: 'Preparing', tone: 'accent', color: '#985168' },
  { key: 'shipped', label: 'Shipped', tone: 'brand', color: '#7a3e52' },
  { key: 'delivered', label: 'Delivered', tone: 'success', color: '#1f6a4a' },
  { key: 'cancelled', label: 'Cancelled', tone: 'danger', color: '#b42318' },
  { key: 'refunded', label: 'Refunded', tone: 'danger', color: '#912018' },
];

const svgNS = 'http://www.w3.org/2000/svg';

function createEl(tag, className = '', text = '') {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== '') element.textContent = text;
  return element;
}

function createSvg(tag, attrs = {}, text = '') {
  const element = document.createElementNS(svgNS, tag);
  for (const [key, value] of Object.entries(attrs)) {
    element.setAttribute(key, String(value));
  }
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

function isBillableOrder(order) {
  return order.status !== 'cancelled' && order.status !== 'refunded';
}

function sumRevenue(orders) {
  return orders
    .filter(isBillableOrder)
    .reduce((sum, order) => sum + Number(order.total_amount || 0), 0);
}

function formatDelta(current, previous) {
  if (previous <= 0 && current <= 0) {
    return { label: '0% vs prior', trend: 'neutral' };
  }
  if (previous <= 0 && current > 0) {
    return { label: '+100% vs prior', trend: 'up' };
  }
  const pct = ((current - previous) / previous) * 100;
  const rounded = Math.round(pct * 10) / 10;
  if (Math.abs(rounded) < 0.1) {
    return { label: '0% vs prior', trend: 'neutral' };
  }
  return {
    label: `${rounded > 0 ? '+' : ''}${rounded}% vs prior`,
    trend: rounded > 0 ? 'up' : 'down',
  };
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

function computeComparisonSeries(orders, users, granularity) {
  const now = new Date();
  const DAY_MS = 24 * 60 * 60 * 1000;

  if (granularity === 'daily') {
    const todayStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    ).getTime();
    const yesterdayStart = todayStart - DAY_MS;

    const buckets = [];
    for (let i = 6; i >= 0; i--) {
      const start = todayStart - i * DAY_MS;
      const end = start + DAY_MS;
      const dateObj = new Date(start);
      const label =
        i === 0
          ? 'Today'
          : dateObj.toLocaleDateString('en-PH', {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
            });
      const shortLabel =
        i === 0 ? 'Today' : dateObj.toLocaleDateString('en-PH', { weekday: 'short' });
      const bucketOrders = orders.filter((order) => {
        const ts = new Date(order.created_at).getTime();
        return ts >= start && ts < end;
      });
      buckets.push({
        label,
        shortLabel,
        orders: bucketOrders.length,
        revenue: sumRevenue(bucketOrders),
      });
    }

    const currentOrders = orders.filter(
      (order) => new Date(order.created_at).getTime() >= todayStart,
    );
    const prevOrders = orders.filter((order) => {
      const ts = new Date(order.created_at).getTime();
      return ts >= yesterdayStart && ts < todayStart;
    });
    const currentUsers = users.filter(
      (user) => new Date(user.created_at).getTime() >= todayStart,
    );
    const prevUsers = users.filter((user) => {
      const ts = new Date(user.created_at).getTime();
      return ts >= yesterdayStart && ts < todayStart;
    });

    const prev7Start = todayStart - 14 * DAY_MS;
    const prev7End = todayStart - 7 * DAY_MS;
    const prev7Revenue = sumRevenue(
      orders.filter((o) => {
        const ts = new Date(o.created_at).getTime();
        return ts >= prev7Start && ts < prev7End;
      }),
    );

    return {
      title: 'Daily revenue & order velocity (Last 7 days)',
      subtitle: 'Comparing Today against Yesterday, with 7-day daily trend bars.',
      currentPeriodLabel: 'Today',
      previousPeriodLabel: 'Yesterday',
      benchmarkAvg: prev7Revenue / 7,
      benchmarkLabel: `Prior 7-day daily avg: ${currency(prev7Revenue / 7)}`,
      currentOrders,
      prevOrders,
      currentUsers,
      prevUsers,
      buckets,
    };
  }

  if (granularity === 'weekly') {
    const todayEnd = now.getTime();
    const WEEK_MS = 7 * DAY_MS;
    const thisWeekStart = todayEnd - WEEK_MS;
    const lastWeekStart = thisWeekStart - WEEK_MS;

    const buckets = [];
    for (let i = 6; i >= 0; i--) {
      const end = todayEnd - i * WEEK_MS;
      const start = end - WEEK_MS;
      const startDate = new Date(start);
      const shortLabel =
        i === 0
          ? 'This wk'
          : startDate.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
      const bucketOrders = orders.filter((order) => {
        const ts = new Date(order.created_at).getTime();
        return ts >= start && ts <= end;
      });
      buckets.push({
        label: i === 0 ? 'Current 7 days' : `Week of ${shortLabel}`,
        shortLabel,
        orders: bucketOrders.length,
        revenue: sumRevenue(bucketOrders),
      });
    }

    const currentOrders = orders.filter(
      (order) => new Date(order.created_at).getTime() >= thisWeekStart,
    );
    const prevOrders = orders.filter((order) => {
      const ts = new Date(order.created_at).getTime();
      return ts >= lastWeekStart && ts < thisWeekStart;
    });
    const currentUsers = users.filter(
      (user) => new Date(user.created_at).getTime() >= thisWeekStart,
    );
    const prevUsers = users.filter((user) => {
      const ts = new Date(user.created_at).getTime();
      return ts >= lastWeekStart && ts < thisWeekStart;
    });

    return {
      title: 'Weekly revenue & order comparisons (Last 7 weeks)',
      subtitle: 'Comparing the last 7 days against the prior 7-day week.',
      currentPeriodLabel: 'This week (7d)',
      previousPeriodLabel: 'Last week (prior 7d)',
      benchmarkAvg: sumRevenue(prevOrders),
      benchmarkLabel: `Prior week benchmark: ${currency(sumRevenue(prevOrders))}`,
      currentOrders,
      prevOrders,
      currentUsers,
      prevUsers,
      buckets,
    };
  }

  // Monthly
  const buckets = [];
  for (let i = 5; i >= 0; i--) {
    const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
    const startMs = monthStart.getTime();
    const endMs = monthEnd.getTime();
    const shortLabel = monthStart.toLocaleDateString('en-PH', { month: 'short' });
    const label = monthStart.toLocaleDateString('en-PH', {
      month: 'short',
      year: 'numeric',
    });
    const bucketOrders = orders.filter((order) => {
      const ts = new Date(order.created_at).getTime();
      return ts >= startMs && ts < endMs;
    });
    buckets.push({
      label,
      shortLabel,
      orders: bucketOrders.length,
      revenue: sumRevenue(bucketOrders),
    });
  }

  const thirtyDaysAgo = now.getTime() - 30 * DAY_MS;
  const sixtyDaysAgo = thirtyDaysAgo - 30 * DAY_MS;
  const currentOrders = orders.filter(
    (order) => new Date(order.created_at).getTime() >= thirtyDaysAgo,
  );
  const prevOrders = orders.filter((order) => {
    const ts = new Date(order.created_at).getTime();
    return ts >= sixtyDaysAgo && ts < thirtyDaysAgo;
  });
  const currentUsers = users.filter(
    (user) => new Date(user.created_at).getTime() >= thirtyDaysAgo,
  );
  const prevUsers = users.filter((user) => {
    const ts = new Date(user.created_at).getTime();
    return ts >= sixtyDaysAgo && ts < thirtyDaysAgo;
  });

  return {
    title: 'Monthly revenue & order comparisons (Last 6 months)',
    subtitle: 'Comparing the last 30 days against the preceding 30-day period.',
    currentPeriodLabel: 'Last 30 days',
    previousPeriodLabel: 'Prior 30 days',
    benchmarkAvg: sumRevenue(prevOrders),
    benchmarkLabel: `Prior 30d benchmark: ${currency(sumRevenue(prevOrders))}`,
    currentOrders,
    prevOrders,
    currentUsers,
    prevUsers,
    buckets,
  };
}

function renderTrendSvgChart(container, buckets, benchmarkAvg) {
  const width = 680;
  const height = 220;
  const padLeft = 64;
  const padRight = 28;
  const padTop = 26;
  const padBottom = 36;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const maxRev = Math.max(
    1000,
    benchmarkAvg || 0,
    ...buckets.map((bucket) => bucket.revenue),
  );
  const maxOrders = Math.max(1, ...buckets.map((bucket) => bucket.orders));

  const svg = createSvg('svg', {
    viewBox: `0 0 ${width} ${height}`,
    class: 'w-full h-auto overflow-visible',
    role: 'img',
    'aria-label': 'Revenue and order volume trend chart',
  });

  // Grid lines & Y-axis labels
  for (const ratio of [0, 0.5, 1]) {
    const y = padTop + plotH * (1 - ratio);
    const val = Math.round(maxRev * ratio);
    svg.append(
      createSvg('line', {
        x1: padLeft,
        y1: y,
        x2: width - padRight,
        y2: y,
        stroke: 'var(--color-border)',
        'stroke-dasharray': ratio === 0 ? 'none' : '3 3',
        'stroke-width': 1,
      }),
      createSvg(
        'text',
        {
          x: padLeft - 8,
          y: y + 4,
          'text-anchor': 'end',
          fill: 'var(--color-text-muted)',
          'font-size': '10',
          'font-weight': '600',
        },
        currency(val),
      ),
    );
  }

  // Benchmark dashed line
  if (benchmarkAvg > 0) {
    const benchY = padTop + plotH * (1 - Math.min(1, benchmarkAvg / maxRev));
    svg.append(
      createSvg('line', {
        x1: padLeft,
        y1: benchY,
        x2: width - padRight,
        y2: benchY,
        stroke: 'var(--color-clay)',
        'stroke-dasharray': '5 4',
        'stroke-width': 1.5,
      }),
    );
  }

  const slotWidth = plotW / Math.max(1, buckets.length);
  const barWidth = Math.min(44, Math.max(18, slotWidth * 0.48));
  const linePoints = [];

  buckets.forEach((bucket, index) => {
    const centerX = padLeft + slotWidth * index + slotWidth / 2;
    const revRatio = Math.min(1, bucket.revenue / maxRev);
    const barH = Math.max(bucket.revenue > 0 ? 6 : 2, plotH * revRatio);
    const barY = padTop + plotH - barH;

    // Bar
    svg.append(
      createSvg('rect', {
        x: centerX - barWidth / 2,
        y: barY,
        width: barWidth,
        height: barH,
        rx: 6,
        fill: bucket.revenue > 0 ? 'var(--color-brand)' : 'var(--color-border)',
      }),
    );

    // Value label above bar
    if (bucket.revenue > 0) {
      svg.append(
        createSvg(
          'text',
          {
            x: centerX,
            y: Math.max(12, barY - 6),
            'text-anchor': 'middle',
            fill: 'var(--color-floral-pink)',
            'font-size': '9.5',
            'font-weight': '700',
          },
          currency(bucket.revenue),
        ),
      );
    }

    // X-axis label
    svg.append(
      createSvg(
        'text',
        {
          x: centerX,
          y: height - 10,
          'text-anchor': 'middle',
          fill: 'var(--color-text-muted)',
          'font-size': '10.5',
          'font-weight': '600',
        },
        bucket.shortLabel,
      ),
    );

    const orderRatio = bucket.orders / maxOrders;
    const pointY = padTop + plotH * (1 - orderRatio * 0.85);
    linePoints.push({ x: centerX, y: pointY, orders: bucket.orders });
  });

  // Overlaid Order Count Polyline
  if (linePoints.length > 1) {
    svg.append(
      createSvg('polyline', {
        fill: 'none',
        stroke: 'var(--color-clay)',
        'stroke-width': 2.25,
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
        points: linePoints.map((pt) => `${pt.x},${pt.y}`).join(' '),
      }),
    );
  }

  for (const pt of linePoints) {
    svg.append(
      createSvg('circle', {
        cx: pt.x,
        cy: pt.y,
        r: 4,
        fill: 'var(--color-surface)',
        stroke: 'var(--color-clay)',
        'stroke-width': 2.25,
      }),
    );
  }

  container.replaceChildren(svg);
}

function renderDonutChart(container, orders, fulfillmentRate) {
  const size = 168;
  const stroke = 20;
  const radius = (size - stroke) / 2;
  const center = size / 2;
  const circumference = 2 * Math.PI * radius;

  const svg = createSvg('svg', {
    viewBox: `0 0 ${size} ${size}`,
    width: size,
    height: size,
    role: 'img',
    'aria-label': `Order fulfillment donut chart: ${orders.length} total orders, ${fulfillmentRate}% delivered`,
  });

  // Background track ring
  svg.append(
    createSvg('circle', {
      cx: center,
      cy: center,
      r: radius,
      fill: 'none',
      stroke: 'var(--color-surface-muted)',
      'stroke-width': stroke,
    }),
  );

  if (orders.length > 0) {
    let offsetFraction = 0;
    for (const cfg of statusConfig) {
      const count = orders.filter((order) => order.status === cfg.key).length;
      if (!count) continue;
      const fraction = count / orders.length;
      const segLength = fraction * circumference;
      const circle = createSvg('circle', {
        cx: center,
        cy: center,
        r: radius,
        fill: 'none',
        stroke: cfg.color,
        'stroke-width': stroke,
        'stroke-dasharray': `${segLength} ${circumference - segLength}`,
        'stroke-dashoffset': String(-offsetFraction * circumference),
        transform: `rotate(-90 ${center} ${center})`,
      });
      svg.append(circle);
      offsetFraction += fraction;
    }
  }

  // Center text
  svg.append(
    createSvg(
      'text',
      {
        x: center,
        y: center - 2,
        'text-anchor': 'middle',
        fill: 'var(--color-floral-pink)',
        'font-size': '22',
        'font-weight': '800',
      },
      String(orders.length),
    ),
    createSvg(
      'text',
      {
        x: center,
        y: center + 16,
        'text-anchor': 'middle',
        fill: 'var(--color-text-muted)',
        'font-size': '10',
        'font-weight': '700',
      },
      `${fulfillmentRate}% DELIVERED`,
    ),
  );

  container.replaceChildren(svg);
}

async function fetchAllPages(fetcher, params = {}) {
  const first = await fetcher({ ...params, page: 1, limit: 100 });
  const items = [...(first.data ?? [])];
  const totalPages = first.pagination?.totalPages ?? 1;
  for (let page = 2; page <= Math.min(totalPages, 10); page++) {
    const next = await fetcher({ ...params, page, limit: 100 });
    if (next.data?.length) items.push(...next.data);
  }
  return { data: items, total: first.pagination?.total ?? items.length };
}

if (await pageReady) {
  const periodSelect = find('#analytics-period');
  let chartGranularity = 'daily';
  let rawOrders = [];
  let rawProducts = [];
  let rawCategories = [];
  let rawUsers = [];
  let totalUserCount = 0;

  function render() {
    const period = periodSelect?.value || 'all';
    const filteredOrders = filterOrdersByPeriod(rawOrders, period);
    const activeOrders = filteredOrders.filter(isBillableOrder);
    const grossRevenue = sumRevenue(filteredOrders);
    const averageOrderValue = activeOrders.length
      ? grossRevenue / activeOrders.length
      : 0;
    const deliveredCount = filteredOrders.filter(
      (order) => order.status === 'delivered',
    ).length;
    const awaitingActionCount = filteredOrders.filter((order) =>
      ['pending', 'confirmed', 'preparing'].includes(order.status),
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

    // Time-Series Daily / Weekly / Monthly Comparisons & Trend Chart
    const series = computeComparisonSeries(rawOrders, rawUsers, chartGranularity);
    fillText(document, {
      'trend-chart-title': series.title,
      'trend-chart-subtitle': series.subtitle,
      'trend-benchmark-label': series.benchmarkLabel,
    });

    const curRev = sumRevenue(series.currentOrders);
    const prevRev = sumRevenue(series.prevOrders);
    const curBillable = series.currentOrders.filter(isBillableOrder);
    const prevBillable = series.prevOrders.filter(isBillableOrder);
    const curAov = curBillable.length ? curRev / curBillable.length : 0;
    const prevAov = prevBillable.length ? prevRev / prevBillable.length : 0;

    const comparisonMetrics = [
      {
        label: `Revenue (${series.currentPeriodLabel})`,
        value: currency(curRev),
        prevText: `${series.previousPeriodLabel}: ${currency(prevRev)}`,
        delta: formatDelta(curRev, prevRev),
      },
      {
        label: `Orders (${series.currentPeriodLabel})`,
        value: `${series.currentOrders.length} ${series.currentOrders.length === 1 ? 'order' : 'orders'}`,
        prevText: `${series.previousPeriodLabel}: ${series.prevOrders.length} ${series.prevOrders.length === 1 ? 'order' : 'orders'}`,
        delta: formatDelta(series.currentOrders.length, series.prevOrders.length),
      },
      {
        label: `Avg. basket (${series.currentPeriodLabel})`,
        value: currency(curAov),
        prevText: `${series.previousPeriodLabel}: ${currency(prevAov)}`,
        delta: formatDelta(curAov, prevAov),
      },
      {
        label: `New accounts (${series.currentPeriodLabel})`,
        value: `${series.currentUsers.length} joined`,
        prevText: `${series.previousPeriodLabel}: ${series.prevUsers.length} joined`,
        delta: formatDelta(series.currentUsers.length, series.prevUsers.length),
      },
    ];

    const compGrid = find('#analytics-comparison-grid');
    if (compGrid) {
      compGrid.replaceChildren(
        ...comparisonMetrics.map((metric) => {
          const card = createEl(
            'div',
            'rounded-control border border-border bg-surface-muted/60 p-4',
          );
          const top = createEl(
            'div',
            'flex flex-wrap items-center justify-between gap-2',
          );
          const pill = createEl('span', 'analytics-delta-pill', metric.delta.label);
          pill.dataset.trend = metric.delta.trend;
          top.append(
            createEl('p', 'text-xs font-bold text-text-muted', metric.label),
            pill,
          );
          card.append(
            top,
            createEl('p', 'mt-2 font-display text-2xl text-floral-pink', metric.value),
            createEl('p', 'mt-1 text-xs text-text-muted', metric.prevText),
          );
          return card;
        }),
      );
    }

    const trendChartEl = find('#analytics-trend-chart');
    if (trendChartEl) {
      renderTrendSvgChart(trendChartEl, series.buckets, series.benchmarkAvg);
    }

    const bucketsEl = find('#analytics-trend-buckets');
    if (bucketsEl) {
      bucketsEl.replaceChildren(
        ...series.buckets.map((bucket) => {
          const item = createEl(
            'div',
            'rounded-control border border-border bg-surface px-3 py-2 text-xs',
          );
          item.append(
            createEl('p', 'font-bold text-floral-pink', bucket.shortLabel),
            createEl('p', 'mt-0.5 font-semibold text-text', currency(bucket.revenue)),
            createEl(
              'p',
              'text-[0.68rem] text-text-muted',
              `${bucket.orders} ${bucket.orders === 1 ? 'order' : 'orders'}`,
            ),
          );
          return item;
        }),
      );
    }

    // 1. Donut Chart + Fulfillment Pipeline Breakdown
    const donutEl = find('#analytics-donut-chart');
    if (donutEl) {
      renderDonutChart(donutEl, filteredOrders, fulfillmentRate);
    }

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
        'text-xs font-bold text-floral-pink',
        `${currency(catValue)} (${Math.round(share)}%)`,
      );
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
            ? `Review pending, confirmed, and preparing orders to maintain fast dispatch times. Delivery completion rate is ${fulfillmentRate}%.`
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
            `Order #${order.id.slice(0, 8).toUpperCase()} · ${order.customer?.name ?? 'Customer'}`,
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
          fetchAllPages((params) => adminOrderApi.getOrders(params)),
          fetchAllPages((params) =>
            adminCatalogApi.getProducts({ ...params, status: 'all' }),
          ),
          adminCatalogApi.getCategories(),
          fetchAllPages((params) => adminUserApi.getUsers(params)),
        ]);
      rawOrders = ordersResult.data ?? [];
      rawProducts = productsResult.data ?? [];
      rawCategories = categoriesResult.data ?? [];
      rawUsers = usersResult.data ?? [];
      totalUserCount = usersResult.total ?? rawUsers.length;
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

  for (const button of findAll('[data-chart-granularity]')) {
    button.addEventListener('click', () => {
      chartGranularity = button.dataset.chartGranularity;
      for (const btn of findAll('[data-chart-granularity]')) {
        btn.setAttribute('aria-pressed', String(btn === button));
      }
      render();
    });
  }

  periodSelect?.addEventListener('change', () => render());
  find('[data-refresh-dashboard]')?.addEventListener('click', () => {
    void loadDashboard(true);
  });
  find('[data-export-csv]')?.addEventListener('click', exportCsvReport);

  await loadDashboard();
  watchAvailability(() => loadDashboard(false));
}
