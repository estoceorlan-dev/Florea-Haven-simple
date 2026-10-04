import { imageApi } from './api.js';
import { find, findAll, setImage, errorMessage } from './helpers.js';

// The file input, preview, buttons and progress bar are ordinary HTML elements.
export function enableUpload(root, endpoint, initialUrl, onSaved) {
  const input = find('input[type=file]', root);
  const preview = find('[data-upload-preview]', root);
  const fallback = find('[data-upload-fallback]', root);
  const save = find('[data-upload-save]', root);
  const remove = find('[data-upload-remove]', root);
  const cancel = find('[data-upload-cancel]', root);
  const message = find('[data-upload-message]', root);
  const progress = find('[data-upload-progress]', root);
  let savedUrl = initialUrl;
  let selectedFile = null;
  let previewUrl = '';
  let busy = false;

  function refresh() {
    preview.hidden = !(previewUrl || savedUrl);
    if (previewUrl) preview.src = previewUrl;
    else if (savedUrl) setImage(preview, savedUrl, preview.alt);
    if (fallback) fallback.hidden = !preview.hidden;
    save.disabled = busy || !selectedFile;
    remove.hidden = !savedUrl;
    remove.disabled = busy;
    input.disabled = busy;
    if (cancel) cancel.hidden = !selectedFile;
    progress.hidden = !busy;
  }
  function resetSelection() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = '';
    selectedFile = null;
    input.value = '';
  }
  function showMessage(text, error = false) {
    message.textContent = text;
    message.hidden = !text;
    message.setAttribute('role', error ? 'alert' : 'status');
  }
  input.onchange = () => {
    const file = input.files?.[0];
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = '';
    selectedFile = null;
    showMessage('');
    if (
      file &&
      (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) ||
        file.size > 5 * 1024 * 1024)
    ) {
      showMessage('Choose a JPEG, PNG, or WebP image up to 5 MB.', true);
    } else if (file) {
      selectedFile = file;
      previewUrl = URL.createObjectURL(file);
    }
    refresh();
  };
  if (cancel)
    cancel.onclick = () => {
      resetSelection();
      showMessage('');
      refresh();
    };
  async function send(removing) {
    if (busy || (!removing && !selectedFile)) return;
    busy = true;
    progress.value = 0;
    showMessage('');
    refresh();
    try {
      const result = removing
        ? await imageApi.remove(endpoint)
        : await imageApi.upload(endpoint, selectedFile, (value) => {
            progress.value = value;
          });
      const record = result.data.user ?? result.data.product ?? result.data;
      savedUrl = record.profile_image_url ?? record.image_url ?? null;
      resetSelection();
      onSaved?.(result);
      showMessage(removing ? 'Image removed.' : 'Image saved.');
    } catch (error) {
      showMessage(errorMessage(error), true);
    } finally {
      busy = false;
      refresh();
    }
  }
  save.onclick = () => send(false);
  remove.onclick = () => send(true);
  for (const button of findAll('button', root)) button.type = 'button';
  refresh();
  if (input.files?.length) input.onchange();
}
