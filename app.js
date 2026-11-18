/**
 * app.js — Navigation (hash router), sidebar, keyboard shortcuts and diagnostics.
 * Routes use plain names: #home  #experiments  #<experiment-id>  #docs  #8086  #about
 * (the older #/exp/<id> and #/<page> forms are still accepted)
 */
(function () {
  'use strict';
  const { h } = Sim;
  const main = document.getElementById('main');
  const wsHost = document.getElementById('workspaces');
  const workspaces = new Map(); // id -> workspace (created lazily, kept alive so inputs persist)
  let current = null; // active workspace or null

  /* ---------- Sidebar ---------- */
  const expNav = document.getElementById('expNav');
  Sim.experiments.forEach((d) => {
    expNav.append(
      h('a', { class: 'exp-link', href: `#${d.id}`, 'data-exp': d.id, title: d.subtitle },
        h('span', { class: 'num mono' }, d.number),
        h('span', { class: 'exp-link-text' }, h('b', {}, d.title), h('small', {}, d.summary)))
    );
  });

  Sim.renderHomeCards(document.getElementById('homeCards'));
  let demoMounted = false;

  function getWorkspace(id) {
    if (!workspaces.has(id)) {
      const def = Sim.experiments.find((d) => d.id === id);
      if (!def) return null;
      const ws = Sim.createWorkspace(def);
      wsHost.append(ws.root);
      workspaces.set(id, ws);
    }
    return workspaces.get(id);
  }

  function showView(el) {
    main.querySelectorAll('.view').forEach((v) => v.classList.toggle('active', v === el));
  }

  function route() {
    const parts = (location.hash || '#home').replace(/^#\/?/, '').split('/');
    let page = parts[0] || 'home';
    let arg = parts[1];
    if (Sim.experiments.some((d) => d.id === page)) {
      arg = page; // plain form: #half-adder
      page = 'exp';
    }
    if (page === 'experiments') {
      arg = Sim.store.get('lastExp', Sim.experiments[0].id);
      page = 'exp';
    }
    current = null;
    let navKey = page;
    if (page === 'exp') {
      const ws = getWorkspace(arg) || getWorkspace(Sim.experiments[0].id);
      current = ws;
      Sim.store.set('lastExp', ws.def.id);
      showView(ws.root);
      ws.activate();
      document.title = `${ws.def.title} · 8086 Digital Logic Simulator`;
      navKey = 'experiments';
      arg = ws.def.id;
    } else {
      const view = document.getElementById(`view-${page}`) || document.getElementById('view-home');
      if (page === '8086' && !demoMounted) {
        Sim.mount8086Demo(document.getElementById('demo8086'));
        demoMounted = true;
      }
      showView(view);
      document.title = `${view.dataset.title || 'Home'} · 8086 Digital Logic Simulator`;
      if (page === '8086') navKey = 'docs';
    }
    document.querySelectorAll('[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === navKey));
    document.querySelectorAll('.exp-link').forEach((a) => a.classList.toggle('active', page === 'exp' && a.dataset.exp === arg));
    document.querySelectorAll('.side-link').forEach((a) => a.classList.toggle('active', a.dataset.page === page));
    document.body.classList.remove('nav-open');
    main.scrollTop = 0;
    window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', route);

  /* ---------- Mobile menu ---------- */
  document.getElementById('menuBtn').addEventListener('click', () => document.body.classList.toggle('nav-open'));
  document.getElementById('scrim').addEventListener('click', () => document.body.classList.remove('nav-open'));

  /* ---------- Keyboard shortcuts ---------- */
  document.addEventListener('keydown', (e) => {
    if (!current || e.ctrlKey || e.metaKey || e.altKey) return;
    const target = e.target instanceof Element ? e.target : null;
    const tag = target ? target.tagName.toLowerCase() : '';
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
    const key = (e.key || '').toLowerCase();
    if (key === ' ') {
      if (tag === 'button' || (target && target.getAttribute('role') === 'button')) return; // let buttons activate
      e.preventDefault();
      current.togglePlay();
    } else if (key === 'n' || key === '.') current.step();
    else if (key === 'r') current.reset();
    else current.handleKey(key);
  });

  /* ---------- Diagnostics ----------
   * window.DLS.selfTest() applies every experiment's test states, settles
   * the circuit and checks that (1) every drawn element maps to a real
   * netlist signal, (2) its colour equals the computed logic value, and
   * (3) the outputs equal reference arithmetic. Inputs are restored after.  */
  window.DLS = {
    selfTest() {
      const report = {};
      let failures = 0;
      for (const def of Sim.experiments) {
        const ws = getWorkspace(def.id);
        const saved = JSON.parse(JSON.stringify(ws.getState()));
        const problems = [];
        for (const s of def.testStates()) {
          ws.setStateNow(Object.assign({}, saved, s));
          for (const p of ws.selfCheck()) problems.push(`${JSON.stringify(s)}: ${p}`);
        }
        ws.setStateNow(saved);
        report[def.id] = problems.length ? problems : 'OK';
        failures += problems.length;
      }
      report.summary = failures ? `${failures} problem(s)` : 'All experiments OK';
      return report;
    },
    workspaces,
  };

  route();
})();
