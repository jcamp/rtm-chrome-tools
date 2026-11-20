// Package canonical RTM authentication sources into standalone extensions.
// Run from repository root: node scripts/sync-rtm-auth.mjs
// Extensions cannot import files outside their installed folders.
import { readFile, writeFile } from 'node:fs/promises';
const files = ['rtm.js', 'md5.js'];
const projects = ['tag-list-relationships', 'export-builder'];
for (const file of files) {
  const content = await readFile(new URL('../shared/' + file, import.meta.url));
  for (const project of projects) {
    const destination = new URL('../projects/' + project + '/' + file, import.meta.url);
    await writeFile(destination, content);
    console.log('Updated ' + project + '/' + file);
  }
}
