import { adminUserApi } from './api.js';
import { pageReady, currentUser, updateUser, showPage } from './common.js';
import {
  find,
  fillText,
  copyTemplate,
  dateTime,
  showError,
  showNotice,
  formValues,
  setBusy,
  confirmAction,
  watchAvailability,
} from './helpers.js';
import { enableFilters, fillForm, updatePagination } from './admin-helpers.js';

if (await pageReady) {
  const form = find('#user-form');
  const users = new Map();
  let selected = null;
  let busy = false;
  enableFilters();
  function edit(account = null) {
    selected = account;
    form.hidden = false;
    find('#user-editor-layout').classList.add('xl:grid-cols-[minmax(0,1fr)_22rem]');
    form.setAttribute('aria-label', account ? 'Edit user' : 'Create user');
    fillForm(form, {
      name: account?.name ?? '',
      email: account?.email ?? '',
      role: account?.role ?? 'customer',
      password: '',
    });
    fillText(form, { 'form-title': account ? 'Edit user' : 'Add a user' });
    form.elements.password.closest('label').hidden = Boolean(account);
    form.elements.password.required = !account;
    form.elements.role.disabled = account?.id === currentUser.id;
    find('[data-save-user]', form).textContent = account ? 'Save user' : 'Create user';
    form.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  async function load() {
    if (busy) return;
    try {
      const result = await adminUserApi.getUsers({
        ...Object.fromEntries(new URLSearchParams(location.search)),
        limit: 20,
      });
      fillText(document, {
        'user-count': `User accounts (${result.pagination.total})`,
      });
      find('#admin-user-list').replaceChildren(
        ...result.data.map((account) => {
          users.set(account.id, account);
          const row = copyTemplate('user-row-template');
          row.dataset.userId = account.id;
          const self = account.id === currentUser.id;
          fillText(row, {
            name: account.name + (self ? ' (You)' : ''),
            email: account.email,
            role: account.role === 'admin' ? 'Administrator' : 'Customer',
            'active-status': account.is_active ? 'Active' : 'Inactive',
            joined: 'Joined ' + dateTime(account.created_at),
          });
          find('[data-edit-user]', row).setAttribute(
            'aria-label',
            `Edit ${account.name}`,
          );
          const toggle = find('[data-toggle-user]', row);
          find('[data-field=active-status]', row).dataset.active = account.is_active;
          toggle.textContent = account.is_active ? 'Deactivate' : 'Reactivate';
          toggle.setAttribute('aria-label', `${toggle.textContent} ${account.name}`);
          toggle.disabled = self;
          if (self) toggle.title = 'You cannot deactivate your own account.';
          return row;
        }),
      );
      updatePagination(result.pagination);
    } catch (error) {
      showError(error);
    }
  }
  find('[data-new-user]').addEventListener('click', () => edit());
  find('[data-cancel-editing]', form).addEventListener('click', () => {
    form.hidden = true;
    find('#user-editor-layout').classList.remove('xl:grid-cols-[minmax(0,1fr)_22rem]');
    selected = null;
  });
  find('#admin-user-list').addEventListener('click', (event) => {
    const button = event.target.closest('[data-edit-user], [data-toggle-user]');
    if (!button) return;
    const account = users.get(button.closest('[data-user-id]').dataset.userId);
    if (button.hasAttribute('data-edit-user')) {
      edit(account);
      return;
    }
    const verb = account.is_active ? 'Deactivate' : 'Reactivate';
    confirmAction({
      title: `${verb} ${account.name}?`,
      description: account.is_active
        ? 'Existing sessions will be revoked. Orders and cart history will be preserved.'
        : 'They can sign in again using their existing password.',
      label: `${verb} user`,
      trigger: button,
      action: async () => {
        const result = await adminUserApi.updateUser(account.id, {
          isActive: !account.is_active,
        });
        showNotice(
          `${account.name} was ${result.data.is_active ? 'reactivated' : 'deactivated'}.`,
        );
        await load();
      },
    });
  });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy) return;
    const values = formValues(form);
    const input = {
      name: values.name,
      email: values.email,
      role: form.elements.role.value,
    };
    if (!selected) input.password = values.password;
    busy = true;
    setBusy(form, true);
    showError(null);
    try {
      const result = selected
        ? await adminUserApi.updateUser(selected.id, input)
        : await adminUserApi.createUser(input);
      showNotice(`${result.data.name} was ${selected ? 'updated' : 'created'}.`);
      if (result.data.id === currentUser.id) updateUser(result.data);
      form.hidden = true;
      find('#user-editor-layout').classList.remove(
        'xl:grid-cols-[minmax(0,1fr)_22rem]',
      );
      selected = null;
      busy = false;
      await load();
    } catch (error) {
      showError(error);
    } finally {
      busy = false;
      setBusy(form, false);
    }
  });
  await load();
  watchAvailability(load);
  showPage();
}
