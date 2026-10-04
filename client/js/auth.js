import { authApi } from './api.js';
import { currentUser, pageReady } from './common.js';
import { find, formValues, safeReturnPath, showError, setBusy } from './helpers.js';

const form = find('#auth-form');
const registering = document.body.dataset.page === 'register';

function destination(user) {
  const path = safeReturnPath(sessionStorage.getItem('florea-return-path'));
  sessionStorage.removeItem('florea-return-path');
  return path && !['/login', '/register'].includes(path)
    ? path
    : user.role === 'admin'
      ? '/admin'
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
