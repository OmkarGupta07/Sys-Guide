// Registers every lesson file in index.html and the service worker cache, in curriculum order,
// and sets the cache VERSION to a hash of the app files so phones always pick up changes.
// Run: node tools/wire.js && node tools/check.js
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const vm = require('vm');

const root = path.join(__dirname, '..');
const SG = {};
vm.runInNewContext(fs.readFileSync(path.join(root, 'js', 'curriculum.js'), 'utf8'), { SG });
const files = fs.readdirSync(path.join(root, 'js', 'content')).filter((f) => f.endsWith('.js'));
const order = SG.path.map((p) => `${p[0]}.js`);
files.sort((a, b) => order.indexOf(a) - order.indexOf(b));

const replaceBlock = (text, start, end, body) => {
  const re = new RegExp(`(${start})[\\s\\S]*?(${end})`);
  if (!re.test(text)) throw new Error(`markers ${start} … ${end} not found`);
  return text.replace(re, `$1\n${body}\n$2`);
};

const htmlPath = path.join(root, 'index.html');
const html = replaceBlock(fs.readFileSync(htmlPath, 'utf8'), '<!-- content:start -->', '  <!-- content:end -->',
  files.map((f) => `  <script defer src="js/content/${f}"></script>`).join('\n'));
fs.writeFileSync(htmlPath, html);

const swPath = path.join(root, 'sw.js');
let sw = replaceBlock(fs.readFileSync(swPath, 'utf8'), '// content:start', '  // content:end',
  files.map((f) => `  'js/content/${f}',`).join('\n'));
const hash = crypto.createHash('sha1');
['index.html', 'css/app.css', 'js/app.js', 'js/curriculum.js', 'SYLLABUS.md', ...files.map((f) => `js/content/${f}`)]
  .forEach((f) => hash.update(fs.readFileSync(path.join(root, f))));
sw = sw.replace(/const VERSION = '[^']*';/, `const VERSION = 'sg-${hash.digest('hex').slice(0, 10)}';`);
fs.writeFileSync(swPath, sw);
console.log(`wired ${files.length} lesson files`);
