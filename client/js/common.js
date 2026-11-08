import { adminOrderApi, authApi, cartApi, orderApi } from './api.js';
import {
  find,
  findAll,
  fillText,
  showError,
  safeReturnPath,
  openOverlay,
  confirmAction,
  setImage,
} from './helpers.js';
import {
  buildDefaultStatusNote,
  orderStatusLabels,
  showOrderToast,
} from './order-status.js';
import {
  getStoredThemePreference,
  getSystemTheme,
  resolveTheme,
  applyThemeToDocument,
  persistThemePreference,
} from './theme.js';

export let currentUser = null;

export function showPage() {
  const main = find('main');
  if (main) main.hidden = false;
}

function applyTheme(preference = getStoredThemePreference()) {
  const resolved = resolveTheme(preference, getSystemTheme());
  applyThemeToDocument(preference, resolved);
  for (const select of findAll('[data-theme-select]')) select.value = preference;
  for (const status of findAll('.theme-selector [aria-live]'))
    status.textContent = `${resolved} theme active`;
}

function updateNavigation() {
  const current = new URL(location.href);
  const pathname = current.pathname.replace(/\/$/, '') || '/';
  for (const link of findAll('.nav-link, .drawer-nav-link, .admin-nav-link')) {
    const destination = new URL(link.href);
    const admin = link.classList.contains('admin-nav-link');
    const orders = destination.pathname === '/orders';
    const active =
      ((admin && destination.pathname !== '/admin') || orders
        ? pathname === destination.pathname ||
          pathname.startsWith(destination.pathname + '/')
        : pathname === destination.pathname) &&
      (admin ||
        current.searchParams.get('category') ===
          destination.searchParams.get('category'));
    if (active) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
    if (link.classList.contains('nav-link'))
      link.classList.toggle('nav-link-active', active);
    if (admin) link.classList.toggle('admin-nav-link-active', active);
  }
}
function setupAdminSidebar() {
  const sidebar = find('aside.lg\\:flex');
  if (!sidebar) return;
  sidebar.dataset.adminSidebar = '';
  const mainShell = sidebar.nextElementSibling;
  if (mainShell) mainShell.dataset.adminMainShell = '';

  const headerBox = sidebar.firstElementChild;
  const brandLink = find('a[aria-label="Floréa Haven home"]', headerBox);
  const toggleBtn = document.createElement('button');
  toggleBtn.type = 'button';
  toggleBtn.className = 'admin-sidebar-toggle';
  toggleBtn.dataset.sidebarToggle = '';
  toggleBtn.setAttribute('aria-label', 'Collapse sidebar');
  toggleBtn.setAttribute('aria-expanded', 'true');
  toggleBtn.title = 'Collapse sidebar (auto-collapses after 10s of inactivity)';

  const svgNS = 'http://www.w3.org/2000/svg';
  const icon = document.createElementNS(svgNS, 'svg');
  icon.setAttribute('xmlns', svgNS);
  icon.setAttribute('width', '18');
  icon.setAttribute('height', '18');
  icon.setAttribute('viewBox', '0 0 24 24');
  icon.setAttribute('fill', 'none');
  icon.setAttribute('stroke', 'currentColor');
  icon.setAttribute('stroke-width', '2');
  icon.setAttribute('stroke-linecap', 'round');
  icon.setAttribute('stroke-linejoin', 'round');
  icon.setAttribute('aria-hidden', 'true');
  const rect = document.createElementNS(svgNS, 'rect');
  rect.setAttribute('width', '18');
  rect.setAttribute('height', '18');
  rect.setAttribute('x', '3');
  rect.setAttribute('y', '3');
  rect.setAttribute('rx', '2');
  const path = document.createElementNS(svgNS, 'path');
  path.setAttribute('d', 'M9 3v18');
  icon.append(rect, path);
  toggleBtn.append(icon);

  if (headerBox && brandLink) {
    brandLink.dataset.adminBrand = '';
    const row = document.createElement('div');
    row.className = 'admin-sidebar-header-row';
    headerBox.insertBefore(row, brandLink);
    row.append(brandLink, toggleBtn);
    brandLink.addEventListener('click', (event) => {
      if (document.body.dataset.sidebarCollapsed === 'true') {
        event.preventDefault();
        event.stopPropagation();
        setCollapsed(false);
      }
    });
  }

  for (const link of findAll('.admin-nav-link', sidebar)) {
    const labelSpan = find('span:not(.admin-sidebar-badge)', link);
    if (labelSpan && !link.title) {
      link.title = labelSpan.textContent.trim();
    }
  }

  const signOutBtn = find('[data-sign-out]', sidebar);
  if (signOutBtn) {
    signOutBtn.title = 'Sign out';
    for (const node of [...signOutBtn.childNodes]) {
      if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) {
        const span = document.createElement('span');
        span.className = 'admin-sidebar-label';
        span.textContent = node.textContent.trim();
        node.replaceWith(span);
      }
    }
  }

  let idleTimer = null;
  const IDLE_MS = 10000;

  function setCollapsed(collapsed) {
    document.body.dataset.sidebarCollapsed = String(collapsed);
    toggleBtn.setAttribute('aria-expanded', String(!collapsed));
    toggleBtn.setAttribute(
      'aria-label',
      collapsed ? 'Expand sidebar' : 'Collapse sidebar',
    );
    toggleBtn.title = collapsed
      ? 'Expand sidebar'
      : 'Collapse sidebar (auto-collapses after 10s of inactivity)';
    if (brandLink) {
      brandLink.setAttribute(
        'aria-label',
        collapsed ? 'Expand sidebar' : 'Floréa Haven home',
      );
      if (collapsed) {
        brandLink.title = 'Expand sidebar';
        brandLink.setAttribute('role', 'button');
        brandLink.setAttribute('aria-expanded', 'false');
      } else {
        brandLink.removeAttribute('title');
        brandLink.removeAttribute('role');
        brandLink.removeAttribute('aria-expanded');
      }
    }
    clearTimeout(idleTimer);
    if (!collapsed) {
      idleTimer = setTimeout(() => {
        if (sidebar.contains(document.activeElement)) {
          resetIdleTimer();
          return;
        }
        setCollapsed(true);
      }, IDLE_MS);
    }
  }

  function resetIdleTimer() {
    if (document.body.dataset.sidebarCollapsed === 'true') return;
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      if (sidebar.contains(document.activeElement)) {
        resetIdleTimer();
        return;
      }
      setCollapsed(true);
    }, IDLE_MS);
  }

  toggleBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    const isCollapsed = document.body.dataset.sidebarCollapsed === 'true';
    setCollapsed(!isCollapsed);
  });

  for (const evt of [
    'mousemove',
    'mouseenter',
    'pointerdown',
    'keydown',
    'focusin',
    'touchstart',
    'wheel',
  ]) {
    sidebar.addEventListener(evt, resetIdleTimer, { passive: true });
  }

  setCollapsed(false);
}

updateNavigation();
setupAdminSidebar();
applyTheme();
window
  .matchMedia?.('(prefers-color-scheme: dark)')
  .addEventListener('change', () => applyTheme());
window.addEventListener('storage', (event) => {
  if (event.key === 'florea-theme-preference') applyTheme();
});
document.addEventListener('change', (event) => {
  if (!event.target.matches('[data-theme-select]')) return;
  persistThemePreference(event.target.value);
  applyTheme(event.target.value);
});

export function updateUser(user) {
  currentUser = user;
  const firstName = user?.name.split(' ')[0] ?? '';
  for (const element of findAll('[data-user-display]'))
    element.textContent = user?.name ?? 'Welcome to Floréa Haven';
  for (const element of findAll('[data-user-email]'))
    element.textContent = user?.email ?? 'Sign in to see your account and orders';
  for (const element of findAll('[data-account-name]'))
    element.textContent = user ? `Hi, ${firstName}` : 'Sign in';
  for (const link of findAll('[data-account-link], [data-drawer-account]')) {
    link.href = user
      ? user.role === 'admin'
        ? '/admin'
        : user.role === 'staff'
          ? '/admin/products'
          : '/account'
      : '/login';
    link.setAttribute('aria-label', user ? `Open account for ${user.name}` : 'Sign in');
    if (link.matches('[data-drawer-account]'))
      link.lastChild.textContent = user ? 'My account' : 'Sign in';
  }
  for (const element of findAll('[data-member-only]')) element.hidden = !user;
  for (const link of findAll('[data-notification-link]'))
    link.hidden = !user || user.role !== 'customer';
  for (const link of findAll('[data-admin-only]')) link.hidden = user?.role !== 'admin';
  for (const element of findAll('[data-user-role]'))
    element.textContent = user?.role === 'staff' ? 'Staff' : 'Admin';
  for (const element of findAll('[data-workspace-role]'))
    element.textContent = user?.role === 'staff' ? 'Staff' : 'Administrator';
  for (const element of findAll('[data-workspace-label]'))
    element.textContent =
      user?.role === 'staff' ? 'Staff workspace' : 'Admin workspace';
  for (const element of findAll('[data-workspace-menu]'))
    element.textContent = user?.role === 'staff' ? 'Staff menu' : 'Admin menu';
  fillText(document, {
    greeting: `Welcome${firstName ? ', ' + firstName : ''}.`,
    'account-email': user?.email ?? '',
    'account-role': user?.role ?? '',
    'admin-greeting': `Welcome back${firstName ? ', ' + firstName : ''}.`,
  });
  for (const element of findAll('[data-avatar-initial]')) {
    element.textContent = '';
    element.hidden = true;
  }
  for (const avatar of findAll('[data-user-avatar]')) {
    const image = find('img', avatar);
    const initial = find('[data-avatar-initial]', avatar);
    const guest = find('svg', avatar);
    const hasImage = Boolean(user?.profile_image_url);
    if (image) image.hidden = !hasImage;
    if (initial) initial.hidden = true;
    if (guest) {
      guest.hidden = hasImage;
      guest.toggleAttribute('hidden', hasImage);
    }
    if (hasImage && image) setImage(image, user.profile_image_url, '');
  }
}

export async function refreshCartBadge(cart) {
  if (currentUser && currentUser.role !== 'customer') return;
  try {
    if (!cart && currentUser) cart = (await cartApi.getCart()).data.cart;
    const count = cart?.summary.item_count ?? 0;
    for (const link of findAll('[data-cart-link]'))
      link.setAttribute('aria-label', `Shopping cart with ${count} items`);
    for (const badge of findAll('[data-cart-count]')) {
      badge.textContent = count;
      badge.hidden = count === 0;
      badge.style.display = count === 0 ? 'none' : '';
    }
  } catch {
    /* The cart page provides a retry when its API cannot be reached. */
  }
}

export async function refreshAdminOrdersBadge() {
  if (!currentUser || !['admin', 'staff'].includes(currentUser.role)) return;
  try {
    const result = await adminOrderApi.getOrders({ limit: 1 });
    const orderCount = result.pagination?.total ?? result.data?.length ?? 0;
    for (const badge of findAll('[data-admin-orders-badge]')) {
      badge.textContent = String(orderCount);
      badge.hidden = false;
      badge.style.display = '';
    }
  } catch {
    /* Ignore non-blocking badge refresh errors */
  }
}

export function getDismissedNotificationsMap(userId = currentUser?.id) {
  const key = `florea-dismissed-order-notifs-${userId ?? 'guest'}`;
  try {
    return JSON.parse(localStorage.getItem(key) || '{}');
  } catch {
    return {};
  }
}

export function markNotificationRead(order, userId = currentUser?.id) {
  const key = `florea-dismissed-order-notifs-${userId ?? 'guest'}`;
  const dismissed = getDismissedNotificationsMap(userId);
  dismissed[order.id] = `${order.status}|${order.status_updated_at ?? ''}`;
  try {
    localStorage.setItem(key, JSON.stringify(dismissed));
  } catch {
    /* Ignore storage quota errors */
  }
}

export function updateNotificationBellBadge(orders = []) {
  const dismissed = getDismissedNotificationsMap();
  const unreadCount = orders.filter((order) => {
    const signature = `${order.status}|${order.status_updated_at ?? ''}`;
    return dismissed[order.id] !== signature;
  }).length;
  for (const link of findAll('[data-notification-link]')) {
    link.setAttribute(
      'aria-label',
      unreadCount > 0 ? `Notifications (${unreadCount} unread)` : 'Notifications',
    );
  }
  for (const badge of findAll('[data-notification-count]')) {
    badge.textContent = unreadCount;
    badge.hidden = unreadCount === 0;
    badge.style.display = unreadCount === 0 ? 'none' : '';
  }
  return unreadCount;
}

let activeNavOverlay = null;

document.addEventListener('click', (event) => {
  const logout = event.target.closest('[data-sign-out]');
  if (logout) {
    let trigger = logout;
    if (logout.closest('#navigation-overlay') && activeNavOverlay) {
      activeNavOverlay.close();
      activeNavOverlay = null;
      trigger = find('[data-open-navigation]') ?? logout;
    }
    confirmAction({
      title: 'Sign out of Floréa Haven?',
      description:
        'You will need to sign in again to access your account, saved cart, orders, or workspace.',
      label: 'Sign out',
      cancelLabel: 'Stay signed in',
      trigger,
      action: async () => {
        await authApi.logout();
        sessionStorage.removeItem('florea-return-path');
        location.assign('/');
      },
    });
    return;
  }
  const menu = event.target.closest('[data-open-navigation]');
  if (menu) {
    menu.setAttribute('aria-expanded', 'true');
    const overlay = openOverlay('navigation-template', menu);
    activeNavOverlay = overlay;
    updateNavigation();
    updateUser(currentUser);
    applyTheme();
    void refreshAdminOrdersBadge();
    overlay.root.addEventListener('click', (event) => {
      if (event.target.closest('a[href]')) overlay.close();
    });
  }
  const search = event.target.closest('[data-toggle-search]');
  if (search) {
    const form = find('#site-search-form');
    form.hidden = !form.hidden;
    search.setAttribute('aria-expanded', String(!form.hidden));
    if (!form.hidden) find('input', form).focus();
  }
});

export async function checkCustomerOrderNotifications() {
  if (!currentUser || currentUser.role !== 'customer') {
    updateNotificationBellBadge([]);
    return;
  }
  try {
    const result = await orderApi.getOrders({ limit: 20 });
    const orders = result.data ?? [];
    updateNotificationBellBadge(orders);
    if (
      document.body.dataset.page === 'orders' ||
      document.body.dataset.page === 'notifications'
    )
      return;
    const dismissed = getDismissedNotificationsMap();
    for (const order of orders.slice(0, 2)) {
      if (order.status === 'pending' && !order.courier_name && !order.status_note)
        continue;
      const signature = `${order.status}|${order.status_updated_at ?? ''}`;
      if (dismissed[order.id] === signature) continue;
      showOrderToast({
        title: `${order.preview_product_name || 'Your order'} · ${orderStatusLabels[order.status] ?? order.status}`,
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
        linkHref: `/orders/${order.id}`,
        linkLabel: 'View order details',
        tone:
          order.status === 'cancelled'
            ? 'danger'
            : order.status === 'refunded'
              ? 'refund'
              : 'info',
        onDismiss: () => {
          markNotificationRead(order);
          updateNotificationBellBadge(orders);
        },
      });
    }
  } catch {
    /* Non-blocking background notification check */
  }
}

export const pageReady = (async () => {
  try {
    currentUser = (await authApi.getMe()).data.user;
  } catch (error) {
    if (error.status !== 401 && document.body.dataset.access !== 'public') {
      showError(error);
      const main = find('main');
      if (main) main.hidden = false;
      return false;
    }
  }
  const access = document.body.dataset.access;
  if (access !== 'public' && !currentUser) {
    sessionStorage.setItem(
      'florea-return-path',
      safeReturnPath(location.pathname + location.search) ?? '/',
    );
    location.replace('/login');
    return false;
  }
  if (access === 'admin' && currentUser.role !== 'admin') {
    location.replace('/account');
    return false;
  }
  if (access === 'staff' && !['admin', 'staff'].includes(currentUser.role)) {
    location.replace('/account');
    return false;
  }
  for (const link of findAll('[data-admin-only]'))
    link.hidden = currentUser.role !== 'admin';
  updateUser(currentUser);
  if (access === 'public' || document.body.dataset.page === 'admin-home') showPage();
  void refreshCartBadge();
  void refreshAdminOrdersBadge();
  void checkCustomerOrderNotifications();
  return true;
})();
