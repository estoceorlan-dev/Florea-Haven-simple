// Copy the plain website to dist. No templates, JSX, or bundling are compiled.
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const client = path.join(root, 'client');
const output = path.join(client, 'dist');
if (
  path.dirname(output) !== client ||
  (existsSync(output) && lstatSync(output).isSymbolicLink())
)
  throw new Error('The build output must be the project client/dist directory.');

rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });
function copy(source, destination) {
  if (source.endsWith('.test.js')) return;
  const info = lstatSync(source);
  if (info.isSymbolicLink()) throw new Error('Website sources must be regular files.');
  if (info.isDirectory()) {
    mkdirSync(destination, { recursive: true });
    for (const name of readdirSync(source))
      copy(path.join(source, name), path.join(destination, name));
  } else copyFileSync(source, destination);
}
for (const name of ['index.html', 'pages', 'admin', 'css', 'js', 'licenses']) {
  copy(path.join(client, name), path.join(output, name));
}
copy(path.join(client, 'public'), output);
const rootAssets = path.join(root, 'assets');
if (existsSync(rootAssets)) {
  const distAssets = path.join(output, 'assets');
  mkdirSync(distAssets, { recursive: true });
  const badgeSource = path.join(rootAssets, 'Florea Haven Floral Badge.png');
  const logoSource = path.join(rootAssets, 'Florea Haven Floral Logo.png');
  const gardenSource = path.join(rootAssets, 'Floral Shop Garden.jpg');
  const promiseGardenSource = path.join(rootAssets, 'garden.jpg');
  if (existsSync(badgeSource)) {
    copyFileSync(badgeSource, path.join(distAssets, 'florea-badge.png'));
  }
  if (existsSync(logoSource)) {
    copyFileSync(logoSource, path.join(distAssets, 'florea-logo.png'));
  }
  if (existsSync(gardenSource)) {
    copyFileSync(gardenSource, path.join(distAssets, 'floral-shop-garden.jpg'));
  }
  if (existsSync(promiseGardenSource)) {
    copyFileSync(promiseGardenSource, path.join(distAssets, 'garden.jpg'));
  }
}

const apiBaseUrl = (
  process.env.API_BASE_URL ||
  process.env.VITE_API_URL ||
  process.env.FLOREA_API_URL ||
  ''
).replace(/\/+$/, '');
if (apiBaseUrl) {
  const apiPath = path.join(output, 'js', 'api.js');
  const content = readFileSync(apiPath, 'utf8').replace(
    "const configuredApiBaseUrl = '';",
    `const configuredApiBaseUrl = ${JSON.stringify(apiBaseUrl)};`,
  );
  writeFileSync(apiPath, content, 'utf8');
}
console.log('Copied plain HTML, CSS, JavaScript, and images to client/dist.');
