// Validates all content: run `node tools/check.js`. Exits 1 on any problem.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const SG = { topics: [], add(t) { this.topics.push(t); } };
const ctx = vm.createContext({ SG });
const dir = path.join(root, 'js', 'content');
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.js'));
files.forEach((f) => vm.runInContext(fs.readFileSync(path.join(dir, f), 'utf8'), ctx, { filename: f }));

const errors = [];
const need = (cond, msg) => { if (!cond) errors.push(msg); };
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const ids = new Set();

for (const t of SG.topics) {
  const at = `[${t.id}]`;
  need(!ids.has(t.id), `${at} duplicate id`); ids.add(t.id);
  ['ref', 'section', 'title', 'short', 'blurb', 'intro'].forEach((k) => need(typeof t[k] === 'string' && t[k], `${at} missing ${k}`));
  const names = Object.keys(t.options || {});
  need(names.length >= 2 && names.length <= 8, `${at} needs 2-8 options`);
  for (const n of names) {
    const o = t.options[n];
    ['eli5', 'def', 'scale'].forEach((k) => need(typeof o[k] === 'string' && o[k], `${at} ${n} missing ${k}`));
    need(Array.isArray(o.industry) && o.industry.length >= 2, `${at} ${n} needs 2+ industry examples`);
    need(Array.isArray(o.scenarios) && o.scenarios.length >= 2, `${at} ${n} needs 2+ scenarios`);
  }
  need(t.scenarios.length >= 5, `${at} needs 5+ scenario types (one practice round)`);
  const answers = new Set();
  t.scenarios.forEach((fn, i) => {
    // run each template many times so every random branch is exercised
    for (let r = 0; r < 50; r++) {
      const s = fn(pick);
      const sa = `${at} scenario ${i}`;
      need(typeof s.q === 'string' && !s.q.includes('undefined'), `${sa} bad question text`);
      const choices = s.choices || names;
      need(choices.includes(s.answer), `${sa} answer "${s.answer}" is not a choice`);
      need(new Set(choices).size === choices.length, `${sa} duplicate choices: ${choices.join(' | ')}`);
      if (s.choices) answers.add('*custom');
      need(s.hint && Array.isArray(s.steps) && s.steps.length >= 2, `${sa} needs hint and 2+ steps`);
      (s.followups || []).forEach((f, j) => need(f.q && f.why && Array.isArray(f.options) && f.options.length >= 2, `${sa} follow-up ${j} malformed`));
      answers.add(s.answer);
    }
  });
  need(answers.has('*custom') || answers.size === names.length, `${at} not every option is a correct answer somewhere (${[...answers].join(', ')})`);
}

// curriculum: unique ids, every content topic on the path, every syllabus ID covered
vm.runInContext(fs.readFileSync(path.join(root, 'js', 'curriculum.js'), 'utf8'), ctx, { filename: 'curriculum.js' });
const pathIds = SG.path.map((p) => p[0]);
need(new Set(pathIds).size === pathIds.length, 'curriculum has duplicate lesson ids');
SG.topics.forEach((t) => need(pathIds.includes(t.id), `[${t.id}] is not on the curriculum path`));
const covered = new Set(SG.path.flatMap((p) => p[2].split(' ')));
const sylIds = [...fs.readFileSync(path.join(root, 'SYLLABUS.md'), 'utf8').matchAll(/^- (\w+)/gm)].map((m) => m[1]);
sylIds.forEach((id) => need(covered.has(id), `syllabus ${id} is not in any curriculum lesson`));
covered.forEach((id) => need(sylIds.includes(id), `curriculum refers to unknown syllabus id ${id}`));

// every content file must be loaded by the page and cached by the service worker
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
files.forEach((f) => {
  need(html.includes(`js/content/${f}`), `index.html doesn't load ${f}`);
  need(sw.includes(`js/content/${f}`), `sw.js doesn't cache ${f}`);
});

const unique = [...new Set(errors)];
if (unique.length) { console.error(unique.join('\n')); process.exit(1); }
console.log(`OK: ${SG.topics.length} topics, ${SG.topics.reduce((n, t) => n + t.scenarios.length, 0)} scenario types`);
