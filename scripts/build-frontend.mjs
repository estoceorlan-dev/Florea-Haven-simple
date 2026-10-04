// Copy the plain website to dist. No templates, JSX, or bundling are compiled.
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  rmSync,
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
console.log('Copied plain HTML, CSS, JavaScript, and images to client/dist.');
