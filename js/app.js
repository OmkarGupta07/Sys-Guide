'use strict';

// Content files call SG.add(topic):
// { id, ref, section, title, short, blurb, intro,
//   options: { Name: { eli5, industry[], def, scenarios[], scale } },
//   scenarios: [ (pick) => ({ q, answer, hint, steps[], followups: [{ q, options[] (correct first), why }] }) ] }
// tools/check.js validates every topic.
const SG = (window.SG = { topics: [], add(t) { this.topics.push(t); } });

const $view = () => document.getElementById('view');
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const shuffle = (a) => a.map((v) => [Math.random(), v]).sort((x, y) => x[0] - y[0]).map((v) => v[1]);
const byId = (id) => SG.topics.find((t) => t.id === id);
const KEYS = 'ABCDEFGH';

const store = {
  get() { try { return JSON.parse(localStorage.getItem('sg.progress')) || {}; } catch { return {}; } },
  set(p) { try { localStorage.setItem('sg.progress', JSON.stringify(p)); } catch { /* private mode: progress just isn't kept */ } },
  update(id, fn) { const p = this.get(); p[id] = fn(p[id] || {}); this.set(p); },
};

function render(html) {
  const v = $view();
  v.innerHTML = html;
  window.scrollTo(0, 0);
  v.focus({ preventScroll: true });
}

function setNav(name) {
  document.querySelectorAll('.nav a').forEach((a) => {
    const on = (name === 'home' && a.getAttribute('href') === '#/') || (name === 'syllabus' && a.getAttribute('href') === '#/syllabus');
    on ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current');
  });
}

function sheet(title, text, okLabel, onOk, cancelLabel = 'Cancel') {
  const s = document.createElement('div');
  s.className = 'scrim';
  s.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="sh-t">
    <h3 id="sh-t">${title}</h3><p>${text}</p>
    <div class="row"><button class="btn" data-a="no">${cancelLabel}</button><button class="btn primary" data-a="ok">${okLabel}</button></div></div>`;
  const close = () => { s.remove(); document.removeEventListener('keydown', esc); };
  const esc = (e) => e.key === 'Escape' && close();
  s.addEventListener('click', (e) => {
    if (e.target === s || e.target.dataset.a === 'no') close();
    if (e.target.dataset.a === 'ok') { close(); onOk(); }
  });
  document.addEventListener('keydown', esc);
  document.body.appendChild(s);
  s.querySelector('[data-a="ok"]').focus();
}

/* ---------- home ---------- */

function home() {
  setNav('home');
  const prog = store.get();
  const read = SG.topics.filter((t) => prog[t.id]?.read).length;
  const sessions = SG.topics.reduce((n, t) => n + (prog[t.id]?.sessions || 0), 0) + (prog.drill?.sessions || 0);
  const bests = SG.topics.map((t) => prog[t.id]?.best).filter((b) => b != null);
  const avg = bests.length ? Math.round(bests.reduce((a, b) => a + b, 0) / bests.length) + '%' : '–';

  const st = pathState(prog);
  const today = st.find((s) => s.unlocked && !s.done);
  const doneCount = st.filter((s) => s.done).length;

  let todayCard;
  if (!today) todayCard = '<div class="tcard"><h3>Path complete</h3><p class="muted small">Every day is done. Keep sharp with the mixed drill.</p></div>';
  else if (!today.t) todayCard = `<div class="tcard"><div class="eyebrow">Day ${today.day}</div><h3>${today.title}</h3><p class="muted small">This lesson is still being written. Review earlier days or run a drill meanwhile.</p></div>`;
  else todayCard = `<a class="tcard today" href="#/t/${today.id}">
      <div class="eyebrow">Today · Day ${today.day} of ${st.length}</div><h3>${today.title}</h3><p class="small">${today.t.blurb}</p>
      <div class="meta"><span>${Object.keys(today.t.options).length} concepts · practice round</span><span class="pill">Start</span></div></a>`;

  const row = (s) => {
    const p = prog[s.id] || {};
    const status = s.done ? `<span class="pill done">${p.best}%</span>` : !s.unlocked ? '<span class="lock">Locked</span>' : s.t ? '<span class="pill">Today</span>' : '<span class="lock">Being written</span>';
    const inner = `<span class="dnum">${s.day}</span><span class="dtitle">${s.title}<small>${s.refs}</small></span>${status}`;
    return s.unlocked && s.t ? `<a class="drow${s === today ? ' now' : ''}" href="#/t/${s.id}">${inner}</a>` : `<div class="drow off">${inner}</div>`;
  };
  const weeks = [];
  for (let i = 0; i < st.length; i += 7) weeks.push(st.slice(i, i + 7));
  const drillReady = doneCount >= 2;

  render(`
    <section class="hero">
      <div class="eyebrow">System design · LLD · Offline</div>
      <h1>Know when, and why.</h1>
      <p class="lead">One lesson a day, in order. Read the cards, then face real scenarios and an interviewer who asks “why?”.</p>
      ${installEvt ? '<button class="btn primary" id="install" style="margin-top:18px">Install app</button>' : ''}
    </section>
    ${streakCard(prog)}
    <div class="stats">
      <div class="stat"><b>${doneCount}/${st.length}</b><span>Days done</span></div>
      <div class="stat"><b>${sessions}</b><span>Practice rounds</span></div>
      <div class="stat"><b>${avg}</b><span>Average best</span></div>
    </div>
    ${todayCard}
    ${drillReady ? `<a class="tcard drill" href="#/drill" style="margin-top:10px">
      <div class="eyebrow" style="color:inherit;opacity:.8">Mixed drill</div>
      <h3>8 scenarios from days you’ve finished</h3>
      <p class="muted small">Closest thing to an interview: you don’t know which topic is coming.</p></a>` : ''}
    ${weeks.map((w, i) => `<div class="section-title">Week ${i + 1}</div><div class="days">${w.map(row).join('')}</div>`).join('')}
    <p class="small muted" style="margin-top:32px">${read} lessons read so far. <a href="#/syllabus" class="link">See the full syllabus</a></p>
  `);
  const btn = document.getElementById('install');
  if (btn) btn.onclick = async () => { installEvt.prompt(); await installEvt.userChoice; installEvt = null; home(); };
}

// Chrome fires this when the app is installable; we show our own button instead of relying on the menu.
let installEvt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installEvt = e;
  if (!location.hash || location.hash === '#/') home();
});
window.addEventListener('appinstalled', () => { installEvt = null; });

// Streak = consecutive local calendar days with at least one finished practice round.
// It stays alive until the end of the day after the last study day.
const dayKey = (d = new Date()) => d.toLocaleDateString('en-CA'); // YYYY-MM-DD in local time
function streakOf(days) {
  const set = new Set(days);
  const d = new Date();
  if (!set.has(dayKey(d))) d.setDate(d.getDate() - 1);
  let n = 0;
  while (set.has(dayKey(d))) { n++; d.setDate(d.getDate() - 1); }
  return n;
}
function recordStudyDay() {
  store.update('_streak', (s) => {
    const days = [...new Set([...(s.days || []), dayKey()])].slice(-400);
    return { days, best: Math.max(s.best || 0, streakOf(days)) };
  });
}
function streakCard(prog) {
  const s = prog._streak || {};
  const days = s.days || [];
  const cur = streakOf(days);
  const doneToday = days.includes(dayKey());
  const week = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (6 - i));
    return `<span class="wd${days.includes(dayKey(d)) ? ' on' : ''}${i === 6 ? ' today' : ''}"><i></i>${d.toLocaleDateString('en', { weekday: 'narrow' })}</span>`;
  }).join('');
  const msg = doneToday ? 'Done for today. See you tomorrow.' : cur ? `Finish today’s round to keep your ${cur}-day streak.` : 'Finish one practice round today to start a streak.';
  return `<div class="streak"><div><b>${cur}</b><span>day streak${s.best ? ` · best ${s.best}` : ''}</span><p>${msg}</p></div><div class="week">${week}</div></div>`;
}

// Day N unlocks when day N-1 has at least one finished practice round.
function pathState(prog = store.get()) {
  let open = true;
  return SG.path.map(([id, title, refs], i) => {
    const s = { day: i + 1, id, title, refs, t: byId(id), done: (prog[id]?.sessions || 0) > 0, unlocked: open };
    open = open && s.done;
    return s;
  });
}
const dayOf = (id) => pathState().find((s) => s.id === id);

/* ---------- learn ---------- */

function learn(t) {
  setNav('');
  const names = Object.keys(t.options);
  const block = (label, body) => `<div class="block"><div class="label">${label}</div>${body}</div>`;
  const list = (a) => `<ul>${a.map((x) => `<li>${x}</li>`).join('')}</ul>`;
  render(`
    <a class="back" href="#/">← All topics</a>
    <div class="eyebrow">Day ${dayOf(t.id).day} · ${t.section}</div>
    <h1>${t.title}</h1>
    <p class="lead">${t.intro}</p>
    <nav class="chips" aria-label="Concepts">${names.map((n, i) => `<a href="#c${i}" data-jump="c${i}">${n}</a>`).join('')}</nav>
    ${names.map((n, i) => {
      const o = t.options[n];
      return `<section class="concept" id="c${i}">
        <h2>${n}<small>${i + 1} of ${names.length}</small></h2>
        ${block('In plain words', `<p class="eli5">${o.eli5}</p>`)}
        ${block('Where the industry uses it', list(o.industry))}
        ${block('Definition', `<p>${o.def}</p>`)}
        ${block('Scenarios where it fits', list(o.scenarios))}
        ${block('Scale', `<p class="scale">${o.scale}</p>`)}
      </section>`;
    }).join('')}
    <div class="cta">
      <h2>Ready to test it?</h2>
      <p class="muted">${Math.min(5, t.scenarios.length)} scenarios with follow-up questions.</p>
      <button class="btn primary block" id="start">Start practice</button>
    </div>
  `);
  store.update(t.id, (p) => ({ ...p, read: true }));
  // chips scroll in-page without changing the route
  $view().querySelectorAll('[data-jump]').forEach((a) => a.addEventListener('click', (e) => {
    e.preventDefault();
    document.getElementById(a.dataset.jump).scrollIntoView({ behavior: 'smooth' });
  }));
  document.getElementById('start').onclick = () => sheet(
    'Start practice?',
    'You won’t be able to go back to the cards until this round ends.',
    'Start', () => location.replace(`#/p/${t.id}`), 'Keep reading');
}

/* ---------- practice ---------- */

function practice(ids, count, progKey) {
  setNav('');
  // queue of [topic, scenarioFn]; a single topic never repeats a scenario type in one round
  const pool = shuffle(ids.flatMap((id) => byId(id).scenarios.map((fn) => [byId(id), fn])));
  const queue = pool.slice(0, Math.min(count, pool.length));
  let i = 0, score = 0, fuRight = 0, fuTotal = 0;

  const exit = () => sheet('Leave this round?', 'Your answers in this round won’t be saved.', 'Leave', () => { location.hash = '#/'; }, 'Stay');

  function question() {
    const [t, fn] = queue[i];
    const s = fn(pick);
    const names = shuffle(s.choices || Object.keys(t.options)); // numeric questions bring their own choices
    let tries = 0;
    render(`
      <div class="qhead"><span>${progKey === 'drill' ? t.short + ' · ' : ''}Scenario ${i + 1} of ${queue.length}</span><button class="x" id="exit" aria-label="Leave practice">×</button></div>
      <div class="progress"><i style="width:${(i / queue.length) * 100}%"></i></div>
      <p class="scenario">${s.q}</p>
      <div id="hint"><button class="link" id="hintBtn">Show hint</button></div>
      <div class="opts" id="opts">${names.map((n, k) => `<button class="opt" data-n="${n}"><span class="k">${KEYS[k]}</span><span>${n}</span></button>`).join('')}</div>
      <div id="fb" aria-live="polite"></div>
    `);
    document.getElementById('exit').onclick = exit;
    document.getElementById('hintBtn').onclick = () => { document.getElementById('hint').innerHTML = `<div class="hint">${s.hint}</div>`; };
    const fb = document.getElementById('fb');
    const btns = [...document.querySelectorAll('.opt')];

    btns.forEach((b) => b.onclick = () => {
      const n = b.dataset.n;
      tries++;
      if (n !== s.answer && tries === 1) {
        // first miss: teach where the picked option *would* fit, don't reveal the answer yet
        const o = t.options[n];
        b.classList.add('bad'); b.disabled = true;
        if (!o) {
          fb.innerHTML = `<div class="fb warn"><h3>Not quite</h3><p class="small">${s.misses?.[n] || 'Check your units and the order of magnitude.'}</p>
            <p class="small" style="margin-top:10px"><b>Re-read the scenario and try again.</b></p></div>`;
          fb.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          return;
        }
        fb.innerHTML = `<div class="fb warn"><h3>${n} isn’t the best fit here</h3>
          <p class="small">${n} is the right call when:</p><ul class="small">${o.scenarios.slice(0, 3).map((x) => `<li>${x}</li>`).join('')}</ul>
          <div class="scale small">${o.scale}</div>
          <p class="small" style="margin-top:10px"><b>Re-read the scenario and try again.</b></p></div>`;
        fb.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        return;
      }
      const right = n === s.answer;
      if (right) score += tries === 1 ? 1 : 0.5;
      btns.forEach((x) => { x.disabled = true; if (x.dataset.n === s.answer) x.classList.add('ok'); else if (x === b) x.classList.add('bad'); });
      const head = right ? (tries === 1 ? 'Correct' : 'Correct on the second try') : `The answer is ${s.answer}`;
      fb.innerHTML = `<div class="fb ${right ? 'ok' : 'bad'}"><h3>${head}</h3><p class="small">How to think about it:</p>
        <ol class="small">${s.steps.map((x) => `<li>${x}</li>`).join('')}</ol></div><div id="fu"></div>`;
      followups(s.followups || [], 0, document.getElementById('fu'));
      fb.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  function followups(list, k, host) {
    if (k >= list.length) {
      const last = i === queue.length - 1;
      host.insertAdjacentHTML('beforeend', `<button class="btn primary block" id="next">${last ? 'See results' : 'Next scenario'}</button>`);
      document.getElementById('next').onclick = () => { i++; i < queue.length ? question() : summary(); };
      return;
    }
    const f = list[k];
    const opts = shuffle(f.options.map((text, idx) => ({ text, idx }))); // authored with the correct option first
    const box = document.createElement('div');
    box.className = 'fb plain follow';
    box.innerHTML = `<div class="who">Interviewer · follow-up ${k + 1} of ${list.length}</div><p class="q">${f.q}</p>
      <div class="opts">${opts.map((o, j) => `<button class="opt" data-i="${o.idx}"><span class="k">${KEYS[j]}</span><span>${o.text}</span></button>`).join('')}</div><div class="why-host"></div>`;
    host.appendChild(box);
    const bs = [...box.querySelectorAll('.opt')];
    bs.forEach((b) => b.onclick = () => {
      fuTotal++;
      if (b.dataset.i === '0') fuRight++;
      bs.forEach((x) => { x.disabled = true; if (x.dataset.i === '0') x.classList.add('ok'); else if (x === b) x.classList.add('bad'); });
      box.querySelector('.why-host').innerHTML = `<p class="why"><b>Why:</b> ${f.why}</p>`;
      followups(list, k + 1, host);
    });
    if (k > 0) box.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function summary() {
    const pct = Math.round((score / queue.length) * 100);
    store.update(progKey, (p) => ({ ...p, sessions: (p.sessions || 0) + 1, last: pct, best: Math.max(p.best ?? 0, pct) }));
    recordStudyDay();
    const streakNow = streakOf(store.get()._streak.days);
    const msg = pct >= 80 ? 'Interview ready on this one.' : pct >= 50 ? 'Getting there. Another round will lock it in.' : 'Re-read the cards, then try again. Every miss taught you where an option fits.';
    const again = progKey === 'drill' ? '#/drill' : `#/p/${progKey}`;
    const next = progKey === 'drill' ? null : pathState().find((s) => s.day === dayOf(progKey).day + 1);
    const nextBtn = next?.t ? `<a class="btn primary" href="#/t/${next.id}">Day ${next.day} unlocked: ${next.title}</a>` : '';
    render(`
      <div class="eyebrow">Round complete</div>
      <div class="score">${pct}%</div>
      <p class="lead">${msg}</p>
      <p class="streak-note">${streakNow}-day streak</p>
      <div class="stats" style="margin-top:24px">
        <div class="stat"><b>${score}/${queue.length}</b><span>Scenarios</span></div>
        <div class="stat"><b>${fuRight}/${fuTotal}</b><span>Follow-ups</span></div>
        <div class="stat"><b>${queue.length}</b><span>Questions</span></div>
      </div>
      <div class="actions">
        ${nextBtn}
        <a class="btn${nextBtn ? '' : ' primary'}" href="${again}" id="again">New round, new scenarios</a>
        ${progKey === 'drill' ? '' : `<a class="btn" href="#/t/${progKey}">Review the cards</a>`}
        <a class="btn" href="#/">All topics</a>
      </div>`);
    // same hash would not fire hashchange, so restart explicitly
    document.getElementById('again').onclick = (e) => { e.preventDefault(); route(); };
  }

  question();
}

/* ---------- syllabus ---------- */

async function syllabus() {
  setNav('syllabus');
  render('<p class="muted">Loading syllabus…</p>');
  let md = '';
  try { md = await (await fetch('SYLLABUS.md')).text(); } catch { render('<p>Couldn’t load the syllabus. Open the app once while online so it’s saved for offline use.</p>'); return; }
  const linked = {};
  pathState().forEach((s) => s.refs.split(' ').forEach((r) => { linked[r] ??= s; }));
  let html = '', open = false;
  for (const line of md.split('\n')) {
    const h = line.match(/^## (.+)/);
    const it = line.match(/^- (\w+)\s*(★)?\s*(.+)/);
    if (h) { html += `${open ? '</ul>' : ''}<h2>${h[1]}</h2><ul>`; open = true; }
    else if (it && open) {
      const [, id, star, text] = it;
      const s = linked[id];
      const label = s && s.unlocked && s.t ? `<a href="#/t/${s.id}">${text}</a>` : text;
      html += `<li><code>${id}</code><span style="flex:1">${label}${s ? `<small class="day">Day ${s.day}</small>` : ''}</span>${star ? '<span class="star">Often asked</span>' : ''}</li>`;
    }
  }
  render(`<div class="eyebrow">Everything in scope</div><h1>Syllabus</h1>
    <p class="lead">Every item and the day it’s taught. Linked items are unlocked.</p><div class="syl">${html}${open ? '</ul>' : ''}</div>`);
}

/* ---------- router ---------- */

function route() {
  const [, view, id] = location.hash.slice(1).split('/');
  const open = byId(id) && dayOf(id)?.unlocked; // locked or unwritten days fall through to home
  if (view === 't' && open) return learn(byId(id));
  if (view === 'p' && open) return practice([id], 5, id);
  const finished = pathState().filter((s) => s.done && s.t).map((s) => s.id);
  if (view === 'drill' && finished.length >= 2) return practice(finished, 8, 'drill');
  if (view === 'syllabus') return syllabus();
  home();
}

window.addEventListener('hashchange', route);
document.addEventListener('DOMContentLoaded', route);

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => { /* offline support unavailable; app still works online */ });
}
