// Copies only the files the website needs into dist/ for drag-and-drop hosting.
// Run: node tools/check.js && node tools/dist.js
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const out = path.join(root, 'dist');
fs.rmSync(out, { recursive: true, force: true });
['index.html', 'sw.js', 'manifest.webmanifest', 'SYLLABUS.md', 'css', 'js', 'icons']
  .forEach((p) => fs.cpSync(path.join(root, p), path.join(out, p), { recursive: true }));
console.log('Site ready in', out);
