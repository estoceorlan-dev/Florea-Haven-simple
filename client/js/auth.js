import { authApi } from './api.js';
import { currentUser, pageReady } from './common.js';
import {
  find,
  findAll,
  formValues,
  safeReturnPath,
  showError,
  setBusy,
} from './helpers.js';

const form = find('#auth-form');
const registering = document.body.dataset.page === 'register';

for (const button of findAll('[data-toggle-password]', form)) {
  const showLabel = button.getAttribute('aria-label') || 'Show password';
  const hideLabel = showLabel.replace(/^Show/i, 'Hide');
  button.addEventListener('click', () => {
    const input = document.getElementById(button.dataset.togglePassword);
    if (!input) return;
    const showing = input.type === 'password';
    input.type = showing ? 'text' : 'password';
    button.setAttribute('aria-pressed', String(showing));
    button.setAttribute('aria-label', showing ? hideLabel : showLabel);
    const eyeOpen = find('[data-eye-open]', button);
    const eyeClosed = find('[data-eye-closed]', button);
    if (eyeOpen) eyeOpen.hidden = showing;
    if (eyeClosed) eyeClosed.hidden = !showing;
  });
}

function destination(user) {
  const path = safeReturnPath(sessionStorage.getItem('florea-return-path'));
  sessionStorage.removeItem('florea-return-path');
  return path && !['/login', '/register'].includes(path)
    ? path
    : user.role === 'admin'
      ? '/admin'
      : user.role === 'staff'
        ? '/admin/products'
        : '/';
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  await pageReady;
  if (form.getAttribute('aria-busy') === 'true') return;
  showError(null);
  const values = formValues(form);
  if (registering && values.password !== values.confirmPassword) {
    showError(new Error('Passwords do not match.'));
    return;
  }
  setBusy(form, true);
  try {
    const result = registering
      ? await authApi.register({
          name: values.name,
          email: values.email,
          password: values.password,
        })
      : await authApi.login({ email: values.email, password: values.password });
    location.assign(destination(result.data.user));
  } catch (error) {
    showError(error);
    setBusy(form, false);
  }
});

await pageReady;
if (currentUser) location.replace(destination(currentUser));
