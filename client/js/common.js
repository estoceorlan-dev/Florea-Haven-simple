import { authApi, cartApi, orderApi } from './api.js';
import {
  find,
  findAll,
  fillText,
  showError,
  safeReturnPath,
  openOverlay,
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
updateNavigation();
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
  fillText(document, {
    greeting: `Welcome${firstName ? ', ' + firstName : ''}.`,
    'account-email': user?.email ?? '',
    'account-role': user?.role ?? '',
    'admin-greeting': `Welcome back${firstName ? ', ' + firstName : ''}.`,
  });
  for (const element of findAll('[data-avatar-initial]'))
    element.textContent = firstName[0]?.toUpperCase() ?? '';
  for (const avatar of findAll('[data-user-avatar]')) {
    const image = find('img', avatar);
    const initial = find('[data-avatar-initial]', avatar);
    const guest = find('svg', avatar);
    const hasImage = Boolean(user?.profile_image_url);
    image.hidden = !hasImage;
    initial.hidden = !user || hasImage;
    if (guest) guest.hidden = Boolean(user);
    if (hasImage) setImage(image, user.profile_image_url, '');
  }
}

export async function refreshCartBadge(cart) {
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

document.addEventListener('click', async (event) => {
  const logout = event.target.closest('[data-sign-out]');
  if (logout) {
    logout.disabled = true;
    try {
      await authApi.logout();
      sessionStorage.removeItem('florea-return-path');
      location.assign('/');
    } catch (error) {
      showError(error);
      logout.disabled = false;
    }
  }
  const menu = event.target.closest('[data-open-navigation]');
  if (menu) {
    menu.setAttribute('aria-expanded', 'true');
    const overlay = openOverlay('navigation-template', menu);
    updateNavigation();
    updateUser(currentUser);
    applyTheme();
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
  void checkCustomerOrderNotifications();
  return true;
})();
