export const orderStatusLabels = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  preparing: 'Preparing',
  shipped: 'Shipped',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  refunded: 'Refunded',
};

export const allowedOrderTransitions = {
  pending: ['confirmed', 'preparing', 'shipped', 'cancelled', 'refunded'],
  confirmed: ['preparing', 'shipped', 'cancelled', 'refunded'],
  preparing: ['shipped', 'delivered', 'cancelled', 'refunded'],
  shipped: ['delivered', 'cancelled', 'refunded'],
  delivered: ['refunded'],
  cancelled: ['refunded'],
  refunded: [],
};

export const simulatedCouriers = [
  {
    id: 'jnt',
    name: 'J&T Express',
    prefix: 'JNT',
    service: 'Standard Express Parcel',
    daysRange: [2, 3],
  },
  {
    id: 'lbc',
    name: 'LBC Express',
    prefix: 'LBC',
    service: 'Priority Rush Cargo',
    daysRange: [1, 2],
  },
  {
    id: 'flash',
    name: 'Flash Express',
    prefix: 'FLS',
    service: 'Nationwide Door-to-Door',
    daysRange: [2, 4],
  },
  {
    id: 'ninjavan',
    name: 'Ninja Van',
    prefix: 'NJV',
    service: 'Metro & Provincial Hub',
    daysRange: [3, 5],
  },
  {
    id: 'grab',
    name: 'GrabExpress',
    prefix: 'GRB',
    service: 'Same-Day Botanical Messenger',
    daysRange: [0, 0],
  },
];

function makeElement(tag, className = '', text = '') {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text) element.textContent = text;
  return element;
}

function formatShortDate(daysFromNow) {
  const target = new Date(Date.now() + daysFromNow * 86400000);
  return new Intl.DateTimeFormat('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(target);
}

export function buildSimulatedEtaOptions(courier = simulatedCouriers[0]) {
  const [minDays, maxDays] = courier.daysRange;
  const primary =
    minDays === 0
      ? `Same day · Today (${formatShortDate(0)}, within 2–4 hours)`
      : `${minDays}–${maxDays} business days (Est. ${formatShortDate(minDays)} – ${formatShortDate(maxDays)})`;
  return [
    primary,
    `Tomorrow, 1:00 PM – 5:00 PM (${formatShortDate(1)})`,
    `2–3 business days (Est. ${formatShortDate(2)} – ${formatShortDate(3)})`,
    `3–5 business days (Est. ${formatShortDate(3)} – ${formatShortDate(5)})`,
    `Same day · Express window (Within 2–4 hours)`,
  ].filter((item, index, list) => list.indexOf(item) === index);
}

export function buildDefaultStatusNote(status, courierName, trackingNumber, eta) {
  const trackingPart = trackingNumber ? ` (Tracking: ${trackingNumber})` : '';
  const etaPart = eta ? ` Estimated arrival: ${eta}.` : '';
  if (status === 'confirmed') {
    return courierName
      ? `Your order is confirmed and assigned to ${courierName}${trackingPart}.${etaPart}`
      : 'Your order has been confirmed by Floréa Haven and is queued for preparation.';
  }
  if (status === 'preparing') {
    return courierName
      ? `Your order is being processed and packed for ${courierName} pickup${trackingPart}.${etaPart}`
      : 'Our florists are carefully preparing and packaging your order.';
  }
  if (status === 'shipped') {
    return courierName
      ? `Your order is on the way via ${courierName}${trackingPart}.${etaPart}`
      : 'Your order has been handed over to the courier and is on the way.';
  }
  if (status === 'delivered') {
    return 'Your order has been delivered. Thank you for shopping with Floréa Haven!';
  }
  if (status === 'cancelled') {
    return 'Your order was cancelled and any reserved items were returned to stock.';
  }
  if (status === 'refunded') {
    return 'Your order has been refunded.';
  }
  return '';
}

export function openProcessOrderDialog({ order, trigger, onSubmit }) {
  const orderCode = order.id.slice(0, 8).toUpperCase();
  const initialCourier =
    simulatedCouriers.find((item) => item.name === order.courier_name) ??
    simulatedCouriers[0];

  const dialog = makeElement(
    'dialog',
    'm-auto w-[min(100%-1.5rem,30rem)] overflow-hidden rounded-[1.5rem] border border-border bg-surface p-0 text-text shadow-high backdrop:bg-black/60',
  );
  dialog.setAttribute('aria-label', `Process Order #${orderCode}`);

  const header = makeElement(
    'div',
    'border-b border-border bg-surface-muted px-5 py-4',
  );
  const topRow = makeElement('div', 'flex items-center justify-between gap-3');
  const eyebrow = makeElement(
    'p',
    'eyebrow text-clay',
    `Order Fulfillment · Order #${orderCode}`,
  );
  const closeBtn = makeElement('button', 'order-action-btn', 'Close');
  closeBtn.type = 'button';
  topRow.append(eyebrow, closeBtn);

  const title = makeElement(
    'h2',
    'mt-1.5 font-display text-2xl text-floral-pink',
    'Process & Dispatch Order',
  );
  const subtitle = makeElement(
    'p',
    'mt-1 text-xs leading-5 text-text-muted',
    'Select a delivery partner and estimated time of arrival (ETA). This update and notification will immediately appear on the customer’s account.',
  );
  header.append(topRow, title, subtitle);

  const form = makeElement('form', 'p-5 grid gap-4');
  const errorBox = makeElement('p', 'form-alert text-xs', '');
  errorBox.hidden = true;
  errorBox.setAttribute('role', 'alert');

  // Stage selector
  const stageField = makeElement('div', 'form-field');
  const stageLabel = makeElement('label', '', 'Order processing stage');
  stageLabel.htmlFor = 'process-order-stage';
  const stageSelect = makeElement('select', 'form-input');
  stageSelect.id = 'process-order-stage';
  const allowed = allowedOrderTransitions[order.status] ?? [];
  const stageOptions = [
    { value: 'preparing', label: 'Preparing · Packing for courier pickup' },
    { value: 'shipped', label: 'Shipped · Handed over to courier (In transit)' },
    { value: 'confirmed', label: 'Confirmed · Order verified & courier reserved' },
  ].filter((option) => allowed.includes(option.value));

  for (const option of stageOptions) {
    const opt = makeElement('option', '', option.label);
    opt.value = option.value;
    stageSelect.append(opt);
  }
  if (order.status === 'preparing' && allowed.includes('shipped')) {
    stageSelect.value = 'shipped';
  } else if (allowed.includes('preparing')) {
    stageSelect.value = 'preparing';
  }
  stageField.append(stageLabel, stageSelect);

  // Delivery company selector
  const courierField = makeElement('div', 'form-field');
  const courierLabel = makeElement('label', '', 'Delivery company');
  courierLabel.htmlFor = 'process-order-courier';
  const courierSelect = makeElement('select', 'form-input');
  courierSelect.id = 'process-order-courier';
  for (const courier of simulatedCouriers) {
    const opt = makeElement('option', '', `${courier.name} — ${courier.service}`);
    opt.value = courier.id;
    if (courier.id === initialCourier.id) opt.selected = true;
    courierSelect.append(opt);
  }
  courierField.append(courierLabel, courierSelect);

  // Single clean ETA selector (no redundant duplicate input)
  const etaField = makeElement('div', 'form-field');
  const etaLabel = makeElement('label', '', 'Estimated time of arrival (ETA)');
  etaLabel.htmlFor = 'process-order-eta-preset';
  const etaPresetSelect = makeElement('select', 'form-input');
  etaPresetSelect.id = 'process-order-eta-preset';
  etaField.append(etaLabel, etaPresetSelect);

  // Tracking number
  const trackingField = makeElement('div', 'form-field');
  const trackingLabel = makeElement('label', '', 'Tracking number');
  trackingLabel.htmlFor = 'process-order-tracking';
  const trackingInput = makeElement('input', 'form-input font-semibold');
  trackingInput.id = 'process-order-tracking';
  trackingInput.type = 'text';
  trackingField.append(trackingLabel, trackingInput);

  // Customer notification note preview
  const noteField = makeElement('div', 'form-field');
  const noteLabel = makeElement('label', '', 'Customer notification message');
  noteLabel.htmlFor = 'process-order-note';
  const noteInput = makeElement('textarea', 'form-textarea');
  noteInput.id = 'process-order-note';
  noteInput.rows = 2;
  noteField.append(noteLabel, noteInput);

  function selectedCourier() {
    return (
      simulatedCouriers.find((item) => item.id === courierSelect.value) ??
      simulatedCouriers[0]
    );
  }

  function refreshCourierSelection(preserveExisting = false) {
    const courier = selectedCourier();
    const etaOptions = buildSimulatedEtaOptions(courier);
    if (
      preserveExisting &&
      order.estimated_delivery &&
      !etaOptions.includes(order.estimated_delivery)
    ) {
      etaOptions.unshift(order.estimated_delivery);
    }
    etaPresetSelect.replaceChildren(
      ...etaOptions.map((text) => {
        const opt = makeElement('option', '', text);
        opt.value = text;
        return opt;
      }),
    );
    const nextEta =
      preserveExisting && order.estimated_delivery
        ? order.estimated_delivery
        : etaOptions[0];
    etaPresetSelect.value = nextEta;

    const nextTracking =
      preserveExisting && order.tracking_number
        ? order.tracking_number
        : `${courier.prefix}-${orderCode}`;
    trackingInput.value = nextTracking;

    noteInput.value = buildDefaultStatusNote(
      stageSelect.value,
      courier.name,
      nextTracking,
      nextEta,
    );
  }

  refreshCourierSelection(true);

  courierSelect.addEventListener('change', () => refreshCourierSelection(false));
  etaPresetSelect.addEventListener('change', () => {
    noteInput.value = buildDefaultStatusNote(
      stageSelect.value,
      selectedCourier().name,
      trackingInput.value.trim(),
      etaPresetSelect.value,
    );
  });
  trackingInput.addEventListener('input', () => {
    noteInput.value = buildDefaultStatusNote(
      stageSelect.value,
      selectedCourier().name,
      trackingInput.value.trim(),
      etaPresetSelect.value,
    );
  });
  stageSelect.addEventListener('change', () => {
    noteInput.value = buildDefaultStatusNote(
      stageSelect.value,
      selectedCourier().name,
      trackingInput.value.trim(),
      etaPresetSelect.value,
    );
  });

  const actions = makeElement(
    'div',
    'flex flex-col-reverse gap-2.5 pt-2 sm:flex-row sm:justify-end',
  );
  const cancelBtn = makeElement('button', 'button-secondary', 'Keep current status');
  cancelBtn.type = 'button';
  const submitBtn = makeElement(
    'button',
    'button-primary',
    'Process & notify customer',
  );
  submitBtn.type = 'submit';
  actions.append(cancelBtn, submitBtn);

  form.append(
    errorBox,
    stageField,
    courierField,
    etaField,
    trackingField,
    noteField,
    actions,
  );
  dialog.append(header, form);
  document.body.append(dialog);

  function close() {
    dialog.close();
    dialog.remove();
    trigger?.focus();
  }

  closeBtn.addEventListener('click', close);
  cancelBtn.addEventListener('click', close);
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    close();
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const courier = selectedCourier();
    const estimatedDelivery = etaPresetSelect.value.trim();
    const trackingNumber = trackingInput.value.trim();
    const statusNote = noteInput.value.trim();
    if (estimatedDelivery.length < 2) {
      errorBox.textContent = 'Select an estimated time of arrival (ETA).';
      errorBox.hidden = false;
      return;
    }
    errorBox.hidden = true;
    submitBtn.disabled = true;
    cancelBtn.disabled = true;
    submitBtn.textContent = 'Updating order…';
    try {
      await onSubmit({
        status: stageSelect.value,
        courierName: courier.name,
        trackingNumber: trackingNumber || `${courier.prefix}-${orderCode}`,
        estimatedDelivery,
        statusNote,
      });
      close();
    } catch (error) {
      errorBox.textContent =
        error?.details?.[0]?.message ?? error?.message ?? 'Could not process order.';
      errorBox.hidden = false;
      submitBtn.disabled = false;
      cancelBtn.disabled = false;
      submitBtn.textContent = 'Process & notify customer';
    }
  });

  dialog.showModal();
  courierSelect.focus();
}

export function showOrderToast({
  title,
  message,
  eta = '',
  courier = '',
  linkHref = '',
  linkLabel = 'View order',
  tone = 'info',
  onDismiss,
}) {
  if (
    document.body.dataset.access === 'admin' ||
    document.body.dataset.access === 'staff' ||
    document.body.dataset.page?.startsWith('admin-')
  ) {
    return { close() {} };
  }
  let stack = document.getElementById('order-toast-stack');
  if (!stack) {
    stack = makeElement('div', 'order-toast-stack');
    stack.id = 'order-toast-stack';
    stack.setAttribute('aria-live', 'polite');
    document.body.append(stack);
  }
  const toast = makeElement('aside', 'order-toast-card');
  toast.dataset.tone = tone;

  const top = makeElement('div', 'flex items-start justify-between gap-3');
  const badgeWrap = makeElement('div', 'min-w-0');
  const pill = makeElement(
    'p',
    'eyebrow text-clay',
    tone === 'danger'
      ? 'Order Alert'
      : tone === 'refund'
        ? 'Refund Notification'
        : 'Order Update Notification',
  );
  const heading = makeElement(
    'h3',
    'mt-1 font-display text-xl text-floral-pink',
    title,
  );
  badgeWrap.append(pill, heading);

  const dismissBtn = makeElement('button', 'order-action-btn', 'Dismiss');
  dismissBtn.type = 'button';
  top.append(badgeWrap, dismissBtn);

  const body = makeElement('p', 'mt-2 text-xs leading-5 text-text-muted', message);
  toast.append(top, body);

  if (courier || eta) {
    const meta = makeElement('div', 'order-toast-meta mt-2');
    if (courier) {
      meta.append(makeElement('span', 'order-meta-chip', `Courier: ${courier}`));
    }
    if (eta) {
      meta.append(makeElement('span', 'order-meta-chip', `ETA: ${eta}`));
    }
    toast.append(meta);
  }

  if (linkHref) {
    const footer = makeElement('div', 'mt-3 flex items-center justify-end');
    const link = makeElement('a', 'text-link text-xs', linkLabel);
    link.href = linkHref;
    footer.append(link);
    toast.append(footer);
  }

  function removeToast() {
    toast.remove();
    onDismiss?.();
  }

  dismissBtn.addEventListener('click', removeToast);
  stack.append(toast);
  return { close: removeToast };
}

export const customerCancellationReasons = [
  'Changed my mind or ordered by mistake',
  'Need to update delivery address or contact details',
  'Found a different arrangement or item',
  'Delivery time is longer than expected',
  'Duplicate order placed',
  'Other reason',
];

function formatPeso(amount) {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    maximumFractionDigits: 2,
  }).format(Number(amount || 0));
}

function formatPaymentLabel(method) {
  if (method === 'gcash') return 'GCash';
  if (method === 'maya') return 'Maya';
  return 'Cash on Delivery (Voided & Refunded)';
}

export function openOrderCancelledSummaryDialog({ order, reason, details, trigger }) {
  const orderCode = order.id.slice(0, 8).toUpperCase();
  const dialog = makeElement(
    'dialog',
    'm-auto w-[min(100%-1.5rem,30rem)] overflow-hidden rounded-[1.5rem] border border-border bg-surface p-0 text-text shadow-high backdrop:bg-black/60',
  );
  dialog.setAttribute('aria-label', `Order #${orderCode} cancelled and refunded`);

  const header = makeElement(
    'div',
    'border-b border-border bg-surface-muted px-5 py-4',
  );
  const topRow = makeElement('div', 'flex items-center justify-between gap-3');
  const eyebrow = makeElement(
    'p',
    'eyebrow text-clay',
    `Cancellation & Refund · Order #${orderCode}`,
  );
  const closeBtn = makeElement('button', 'order-action-btn', 'Close');
  closeBtn.type = 'button';
  topRow.append(eyebrow, closeBtn);

  const title = makeElement(
    'h2',
    'mt-1.5 font-display text-2xl text-floral-pink',
    'Order Cancelled & Refunded',
  );
  const subtitle = makeElement(
    'p',
    'mt-1 text-xs leading-5 text-text-muted',
    'Your order has been successfully cancelled, your refund has been processed, and the reserved items have been returned to stock.',
  );
  header.append(topRow, title, subtitle);

  const body = makeElement('div', 'p-5 grid gap-4 text-xs');
  const summaryCard = makeElement(
    'div',
    'rounded-card border border-border bg-surface-muted p-4 grid gap-2.5',
  );

  const summaryRows = [
    ['Order reference', `#${orderCode}`],
    ['Order status', 'Cancelled & Refunded'],
    ['Refund amount', formatPeso(order.total_amount)],
    ['Refund method', formatPaymentLabel(order.payment_method)],
    ['Cancellation reason', details ? `${reason} (${details})` : reason],
    ['Inventory status', 'Reserved stock returned to catalog'],
  ];

  for (const [label, value] of summaryRows) {
    const row = makeElement(
      'div',
      'flex items-start justify-between gap-3 border-b border-border pb-2 last:border-b-0 last:pb-0',
    );
    const labelEl = makeElement('span', 'text-text-muted', label);
    const valueEl = makeElement(
      'strong',
      'text-right font-semibold text-floral-pink',
      value,
    );
    row.append(labelEl, valueEl);
    summaryCard.append(row);
  }

  const actions = makeElement('div', 'flex justify-end pt-1');
  const doneBtn = makeElement('button', 'button-primary', 'Done');
  doneBtn.type = 'button';
  actions.append(doneBtn);

  body.append(summaryCard, actions);
  dialog.append(header, body);
  document.body.append(dialog);

  function close() {
    dialog.close();
    dialog.remove();
    trigger?.focus();
  }

  closeBtn.addEventListener('click', close);
  doneBtn.addEventListener('click', close);
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    close();
  });

  dialog.showModal();
  doneBtn.focus();
}

export function openCancelOrderDialog({ order, trigger, onConfirm }) {
  const orderCode = order.id.slice(0, 8).toUpperCase();
  const dialog = makeElement(
    'dialog',
    'm-auto w-[min(100%-1.5rem,30rem)] overflow-hidden rounded-[1.5rem] border border-border bg-surface p-0 text-text shadow-high backdrop:bg-black/60',
  );
  dialog.setAttribute('aria-label', `Cancel Order #${orderCode}`);

  const header = makeElement(
    'div',
    'border-b border-border bg-surface-muted px-5 py-4',
  );
  const topRow = makeElement('div', 'flex items-center justify-between gap-3');
  const eyebrow = makeElement(
    'p',
    'eyebrow text-danger',
    `Cancel Order · Order #${orderCode}`,
  );
  const closeBtn = makeElement('button', 'order-action-btn', 'Close');
  closeBtn.type = 'button';
  topRow.append(eyebrow, closeBtn);

  const title = makeElement(
    'h2',
    'mt-1.5 font-display text-2xl text-floral-pink',
    'Cancel & Refund Order',
  );
  const subtitle = makeElement(
    'p',
    'mt-1 text-xs leading-5 text-text-muted',
    `Select a reason for cancelling Order #${orderCode} (${formatPeso(order.total_amount)}). Your order will be refunded and reserved stock will be returned immediately.`,
  );
  header.append(topRow, title, subtitle);

  const form = makeElement('form', 'p-5 grid gap-4');
  form.noValidate = true;
  const errorBox = makeElement('p', 'form-alert text-xs', '');
  errorBox.hidden = true;
  errorBox.setAttribute('role', 'alert');

  const reasonFieldset = makeElement('fieldset', 'grid gap-2');
  const legend = makeElement(
    'legend',
    'mb-1 text-xs font-semibold text-floral-pink',
    'Reason for cancellation',
  );
  reasonFieldset.append(legend);

  customerCancellationReasons.forEach((reasonText, index) => {
    const optionLabel = makeElement(
      'label',
      'flex cursor-pointer items-center gap-2.5 rounded-control border border-border bg-surface px-3 py-2 text-xs text-text transition hover:border-border-strong',
    );
    const radio = makeElement('input', 'accent-floral-pink');
    radio.type = 'radio';
    radio.name = 'cancelReason';
    radio.value = reasonText;
    if (index === 0) radio.checked = true;
    const textSpan = makeElement('span', '', reasonText);
    optionLabel.append(radio, textSpan);
    reasonFieldset.append(optionLabel);
  });

  const detailsField = makeElement('div', 'form-field');
  const detailsLabel = makeElement(
    'label',
    '',
    'Additional details (optional)',
  );
  detailsLabel.htmlFor = 'cancel-order-details';
  const detailsInput = makeElement('textarea', 'form-textarea');
  detailsInput.id = 'cancel-order-details';
  detailsInput.rows = 2;
  detailsInput.maxLength = 300;
  detailsInput.placeholder = 'Share any additional notes about your cancellation…';
  detailsField.append(detailsLabel, detailsInput);

  const actions = makeElement(
    'div',
    'flex flex-col-reverse gap-2.5 pt-1 sm:flex-row sm:justify-end',
  );
  const keepBtn = makeElement('button', 'button-secondary', 'Keep order');
  keepBtn.type = 'button';
  const confirmBtn = makeElement(
    'button',
    'button-danger',
    'Cancel & refund order',
  );
  confirmBtn.type = 'submit';
  actions.append(keepBtn, confirmBtn);

  form.append(errorBox, reasonFieldset, detailsField, actions);
  dialog.append(header, form);
  document.body.append(dialog);

  function close() {
    dialog.close();
    dialog.remove();
  }

  closeBtn.addEventListener('click', () => {
    close();
    trigger?.focus();
  });
  keepBtn.addEventListener('click', () => {
    close();
    trigger?.focus();
  });
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    close();
    trigger?.focus();
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const selectedRadio = form.querySelector('input[name="cancelReason"]:checked');
    const reason = selectedRadio?.value ?? '';
    const details = detailsInput.value.trim();
    if (!reason) {
      errorBox.textContent = 'Please select a cancellation reason.';
      errorBox.hidden = false;
      return;
    }
    if (reason === 'Other reason' && details.length < 2) {
      errorBox.textContent =
        'Please provide a brief explanation for "Other reason".';
      errorBox.hidden = false;
      detailsInput.focus();
      return;
    }
    errorBox.hidden = true;
    confirmBtn.disabled = true;
    keepBtn.disabled = true;
    confirmBtn.textContent = 'Cancelling & refunding…';
    try {
      const updatedOrder = await onConfirm({ reason, details });
      close();
      openOrderCancelledSummaryDialog({
        order: updatedOrder ?? order,
        reason,
        details,
        trigger,
      });
    } catch (error) {
      errorBox.textContent =
        error?.details?.[0]?.message ??
        error?.message ??
        'Could not cancel order. Please try again.';
      errorBox.hidden = false;
      confirmBtn.disabled = false;
      keepBtn.disabled = false;
      confirmBtn.textContent = 'Cancel & refund order';
    }
  });

  dialog.showModal();
}
