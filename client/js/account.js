import { pageReady, currentUser, updateUser, showPage } from './common.js';
import { find } from './helpers.js';
import { enableUpload } from './upload.js';

if (await pageReady) {
  enableUpload(
    find('[data-upload]'),
    '/api/users/me/profile-image',
    currentUser.profile_image_url,
    (result) => updateUser(result.data.user),
  );
  showPage();
}
