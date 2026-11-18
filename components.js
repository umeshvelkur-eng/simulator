/**
 * components.js — Reusable UI components and the experiment workspace engine.
 *
 * Workspace engine
 * ----------------
 * Each experiment definition supplies:
 *   compute(state)  -> evaluated netlist { values, levels, maxLevel, ... }
 *   renderCircuit(host, ctx), mount(ctx), refresh(ctx)
 * The engine owns the propagation model: after an input changes, signals are
 * revealed one gate level (= one unit gate delay) at a time. Signals whose
 * level has not been reached yet keep their OLD value and are marked
 * "pending", exactly like a real circuit before its outputs settle.
 */
(function () {
  'use strict';
  const Sim = (window.Sim = window.Sim || {});

  Sim.experiments = [];
  Sim.registerExperiment = (def) => Sim.experiments.push(def);

  /* ---------------- DOM helper ---------------- */
  function h(tag, attrs, ...children) {
    const node = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v === undefined || v === null || v === false) continue;
        if (k === 'class') node.className = v;
        else if (k === 'html') node.innerHTML = v;
        else if (k === 'text') node.textContent = v;
        else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
        else node.setAttribute(k, v === true ? '' : v);
      }
    }
    for (const c of children.flat()) {
      if (c === null || c === undefined || c === false) continue;
      node.append(c instanceof Node ? c : document.createTextNode(String(c)));
    }
    return node;
  }
  Sim.h = h;

  /* ---------------- Persistence (never throws) ---------------- */
  Sim.store = {
    get(key, fallback) {
      try {
        const raw = localStorage.getItem('dls:' + key);
        return raw ? JSON.parse(raw) : fallback;
      } catch (e) {
        return fallback;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem('dls:' + key, JSON.stringify(value));
      } catch (e) {
        /* storage unavailable — state simply isn't remembered */
      }
    },
  };
  Sim.prefs = Object.assign({ speed: 180 }, Sim.store.get('prefs', {}));
  Sim.savePrefs = () => Sim.store.set('prefs', Sim.prefs);

  Sim.sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  /* ---------------- Toast ---------------- */
  let toastTimer = null;
  Sim.toast = function (msg) {
    let t = document.getElementById('toast');
    if (!t) {
      t = h('div', { id: 'toast', role: 'status', 'aria-live': 'polite' });
      document.body.append(t);
    }
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
  };

  /* ---------------- Formatting helpers ---------------- */
  /** Static coloured bits, MSB first, grouped in nibbles. */
  Sim.bitsHtml = function (value, width) {
    let out = '<span class="bits">';
    for (let i = width - 1; i >= 0; i--) {
      const b = (value >> i) & 1;
      out += `<i class="b${b}">${b}</i>`;
      if (i % 4 === 0 && i !== 0) out += '<i class="nib"></i>';
    }
    return out + '</span>';
  };

  /** Live bits bound to signals prefix0..prefixN-1 (updated by the engine). */
  Sim.sigBitsHtml = function (prefix, width, extraMsbSig) {
    let out = '<span class="bits live">';
    if (extraMsbSig) out += `<i class="sbit carry" data-sig="${extraMsbSig}" data-sig-text="${extraMsbSig}">0</i><i class="nib"></i>`;
    for (let i = width - 1; i >= 0; i--) {
      out += `<i class="sbit" data-sig="${prefix}${i}" data-sig-text="${prefix}${i}" title="${prefix}${i}">0</i>`;
      if (i % 4 === 0 && i !== 0) out += '<i class="nib"></i>';
    }
    return out + '</span>';
  };

  /** Reads a word from a value map (used with ctx.shown for live outputs). */
  Sim.readWord = (values, prefix, width) => window.Logic.readWord(values, prefix, width);

  /* ---------------- Toggle switch ---------------- */
  Sim.createToggle = function ({ label, sub, value = 0, onChange, key }) {
    const val = h('span', { class: 'toggle-val mono' }, '0');
    const btn = h(
      'button',
      {
        type: 'button', class: 'toggle', role: 'switch', 'aria-checked': 'false',
        'aria-label': `Input ${label}`,
        'data-tip': key ? `Toggle ${label} (key ${key.toUpperCase()})` : `Toggle ${label}`,
      },
      h('span', { class: 'toggle-text' }, h('span', { class: 'toggle-label' }, label), sub ? h('span', { class: 'toggle-sub' }, sub) : null),
      h('span', { class: 'toggle-track' }, h('span', { class: 'toggle-thumb' })),
      val
    );
    let current = value ? 1 : 0;
    btn.addEventListener('click', () => onChange(current ? 0 : 1));
    function set(v) {
      current = v ? 1 : 0;
      btn.classList.toggle('on', current === 1);
      btn.setAttribute('aria-checked', String(current === 1));
      val.textContent = current;
    }
    set(value);
    return { el: btn, set };
  };

  /* ---------------- Segmented control ---------------- */
  Sim.createSegmented = function ({ options, value, onChange, label }) {
    const wrap = h('div', { class: 'segmented', role: 'radiogroup', 'aria-label': label });
    const buttons = options.map((o) => {
      const b = h('button', { type: 'button', role: 'radio', 'data-tip': o.tip, onclick: () => onChange(o.value) }, o.label);
      b._value = o.value;
      wrap.append(b);
      return b;
    });
    function set(v) {
      buttons.forEach((b) => {
        const on = b._value === v;
        b.classList.toggle('active', on);
        b.setAttribute('aria-checked', String(on));
      });
    }
    set(value);
    return { el: wrap, set };
  };

  /* ---------------- Multi-bit number input ----------------
   * Custom values can be typed in binary, decimal or hexadecimal
   * (BIN / DEC / HEX switch), or set with per-bit switches and + / −.
   * Every entry is validated against the current bit width.            */
  const FORMATS = {
    bin: { label: 'BIN', name: 'binary' },
    dec: { label: 'DEC', name: 'decimal' },
    hex: { label: 'HEX', name: 'hexadecimal' },
  };

  Sim.createBinaryInput = function ({ name, label, width, value, onChange, showSigned }) {
    const Logic = window.Logic;
    let w = width;
    let v = value;
    let fmt = FORMATS[Sim.prefs.inputFormat] ? Sim.prefs.inputFormat : 'bin';
    let bitBtns = [];

    const input = h('input', { type: 'text', class: 'bin-text mono', spellcheck: 'false', autocomplete: 'off' });
    const err = h('div', { class: 'field-error', role: 'alert', 'aria-live': 'polite' });
    const readout = h('div', { class: 'bin-readout' });
    const bitsRow = h('div', { class: 'bit-switches', role: 'group', 'aria-label': `${label} bit switches` });

    const fmtSeg = Sim.createSegmented({
      label: `${label} entry format`,
      value: fmt,
      options: Object.entries(FORMATS).map(([key, f]) => ({ value: key, label: f.label, tip: `Type ${name} in ${f.name}` })),
      onChange: (f) => {
        fmt = f;
        Sim.prefs.inputFormat = f; // remembered as the default for other inputs
        Sim.savePrefs();
        fmtSeg.set(f);
        setError('');
        updateFormatUi();
        input.value = formatValue();
      },
    });
    fmtSeg.el.classList.add('fmt-seg');

    /** Current value written in the selected format. */
    function formatValue() {
      if (fmt === 'dec') return String(showSigned ? Logic.toSigned(v, w) : v);
      if (fmt === 'hex') return Logic.toHex(v, w);
      return Logic.toBin(v, w);
    }
    function parse(text) {
      if (fmt === 'dec') return Logic.parseDecimal(text, w, !!showSigned);
      if (fmt === 'hex') return Logic.parseHex(text, w);
      return Logic.parseBinary(text, w);
    }
    function updateFormatUi() {
      const max = Logic.mask(w);
      const examples = {
        bin: `e.g. ${Logic.toBin(Math.min(11, max), w)}`,
        dec: showSigned ? `${-(2 ** (w - 1))} … ${max}` : `0 … ${max}`,
        hex: `0x0 … ${Logic.toHex(max, w)}`,
      };
      input.placeholder = examples[fmt];
      input.setAttribute('aria-label', `${label} in ${FORMATS[fmt].name}`);
      input.setAttribute('inputmode', fmt === 'dec' ? 'numeric' : 'text');
    }

    const step = (delta) => commit((v + delta + 2 ** w) % 2 ** w);
    const btnDec = h('button', { type: 'button', class: 'icon-btn', 'aria-label': `Decrement ${name}`, 'data-tip': `${name} − 1 (wraps around)`, onclick: () => step(-1) }, '−');
    const btnInc = h('button', { type: 'button', class: 'icon-btn', 'aria-label': `Increment ${name}`, 'data-tip': `${name} + 1 (wraps around)`, onclick: () => step(1) }, '+');
    const btnClr = h('button', { type: 'button', class: 'chip-btn', 'data-tip': `Set ${name} to 0`, onclick: () => commit(0) }, '0');
    const btnMax = h('button', { type: 'button', class: 'chip-btn', 'data-tip': `Set all bits of ${name} to 1`, onclick: () => commit(2 ** w - 1) }, 'Max');

    function setError(msg) {
      err.textContent = msg;
      input.classList.toggle('invalid', !!msg);
      input.setAttribute('aria-invalid', msg ? 'true' : 'false');
    }

    input.addEventListener('input', () => {
      const r = parse(input.value);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setError('');
      if (r.value !== v) {
        v = r.value;
        renderBits();
        onChange(v);
      }
    });
    input.addEventListener('blur', () => {
      setError('');
      input.value = formatValue();
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') input.blur();
      else if (e.key === 'ArrowUp') {
        e.preventDefault();
        step(1);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        step(-1);
      }
    });

    function buildBits() {
      bitsRow.replaceChildren();
      bitBtns = [];
      bitsRow.classList.toggle('dense', w > 8);
      for (let i = w - 1; i >= 0; i--) {
        const b = h(
          'button',
          {
            type: 'button', class: 'bit-btn mono' + (i % 4 === 0 && i !== 0 ? ' nib-end' : ''),
            'aria-label': `${name} bit ${i}`, 'data-tip': `${name}${i} · weight ${2 ** i}`,
            onclick: () => commit(v ^ (1 << i)),
          },
          h('span', { class: 'bit-val' }, '0'),
          h('span', { class: 'bit-idx' }, String(i))
        );
        bitBtns[i] = b;
        bitsRow.append(b);
      }
    }
    function renderBits() {
      bitBtns.forEach((b, i) => {
        const bit = (v >> i) & 1;
        b.classList.toggle('on', bit === 1);
        b.setAttribute('aria-pressed', String(bit === 1));
        b.firstChild.textContent = bit;
      });
      readout.innerHTML =
        `<span>Bin <b>${Logic.toBin(v, w)}</b></span>` +
        `<span>Dec <b>${v}</b></span>` +
        (showSigned ? `<span>Signed <b>${Logic.toSigned(v, w)}</b></span>` : '') +
        `<span>Hex <b>${Logic.toHex(v, w)}</b></span>`;
    }
    function render() {
      if (document.activeElement !== input) {
        input.value = formatValue();
        setError('');
      }
      renderBits();
    }
    function commit(nv) {
      v = nv;
      setError('');
      input.value = formatValue();
      renderBits();
      onChange(v);
    }

    const el = h(
      'div',
      { class: 'bin-input' },
      h('div', { class: 'bin-head' }, h('span', { class: 'bin-label' }, label), fmtSeg.el),
      h('div', { class: 'bin-row' }, btnDec, input, btnInc, btnClr, btnMax),
      err,
      readout,
      bitsRow
    );
    buildBits();
    updateFormatUi();
    render();

    return {
      el,
      set(value, width) {
        if (width !== undefined && width !== w) {
          w = width;
          buildBits();
          updateFormatUi();
        }
        v = value;
        render();
      },
    };
  };

  /* ---------------- Truth table ---------------- */
  Sim.createTruthTable = function ({ columns, rows, caption }) {
    const thead = h('thead', {},
      h('tr', {}, columns.map((c) => h('th', { class: `col-${c.group || 'in'}`, scope: 'col', title: c.tip || '' }, c.label)), h('th', { class: 'col-check', scope: 'col' }, 'Verified'))
    );
    const rowEls = new Map();
    const tbody = h('tbody', {}, rows.map((r) => {
      const tr = h('tr', { 'data-row': r.id }, columns.map((c) => h('td', { class: `col-${c.group || 'in'} v${r.values[c.key]}` }, String(r.values[c.key]))), h('td', { class: 'col-check' }, '—'));
      rowEls.set(r.id, tr);
      return tr;
    }));
    const table = h('table', { class: 'truth-table' }, caption ? h('caption', {}, caption) : null, thead, tbody);
    return {
      el: h('div', { class: 'table-wrap' }, table),
      highlight(id) {
        rowEls.forEach((tr, key) => {
          const on = key === id;
          tr.classList.toggle('current', on);
          if (on) tr.setAttribute('aria-current', 'true');
          else tr.removeAttribute('aria-current');
        });
      },
      mark(id, ok) {
        const tr = rowEls.get(id);
        if (!tr) return;
        const cell = tr.lastChild;
        cell.textContent = ok ? '✓' : '✗';
        cell.className = 'col-check ' + (ok ? 'ok' : 'bad');
      },
      clearMarks() {
        rowEls.forEach((tr) => {
          tr.lastChild.textContent = '—';
          tr.lastChild.className = 'col-check';
        });
      },
    };
  };

  /* ---------------- Step-by-step list ----------------
   * steps: [{ level, label, expr, result }]. Items get .done once the
   * propagation reaches their gate level, .next for the upcoming one.  */
  Sim.renderSteps = function (host, steps, note) {
    host.replaceChildren();
    if (note) host.append(h('p', { class: 'muted small' }, note));
    const ol = h('ol', { class: 'step-list' });
    steps.forEach((s, i) => {
      ol.append(
        h('li', { 'data-level': s.level },
          h('span', { class: 'step-num' }, s.num || `Step ${i + 1}`),
          h('div', { class: 'step-body' },
            h('div', { class: 'step-label' }, s.label, s.level !== undefined ? h('span', { class: 'step-t', title: 'Arrival time in unit gate delays' }, `t = ${s.level}`) : null),
            s.expr ? h('div', { class: 'step-expr mono', html: s.expr }) : null,
            s.result ? h('div', { class: 'step-result mono', html: s.result }) : null))
      );
    });
    host.append(ol);
  };

  /** Two-column info table. */
  Sim.kv = (pairs) =>
    h('dl', { class: 'kv' }, pairs.map(([k, v]) => [h('dt', {}, k), h('dd', { html: v })]));

  /* ================================================================== *
   * Workspace engine
   * ================================================================== */
  const ICONS = {
    run: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2.5v11l9-5.5z" fill="currentColor"/></svg>',
    pause: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2.5h3v11H4zM9 2.5h3v11H9z" fill="currentColor"/></svg>',
    step: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 2.5v11l7-5.5z M11 2.5h2.5v11H11z" fill="currentColor"/></svg>',
    reset: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2.5a5.5 5.5 0 1 1-5.2 3.7l1.5.5A4 4 0 1 0 8 4v2L4.8 3.2 8 .5z" fill="currentColor"/></svg>',
  };

  Sim.createWorkspace = function (def) {
    let state;
    try {
      const saved = Sim.store.get('exp:' + def.id, null);
      state = saved ? def.sanitize(saved) : def.defaultState();
    } catch (e) {
      state = def.defaultState();
    }

    const ws = { state, model: null, shown: {}, displayLevel: 0, mode: 'run', timer: null, structureKey: null, sweeping: false };

    /* ----- DOM skeleton: header + four sections ----- */
    const ctlBtn = (id, label, tip, onclick) =>
      h('button', { type: 'button', class: `ctl-btn ctl-${id}`, 'data-tip': tip, 'aria-label': label, onclick }, h('span', { class: 'ico', html: ICONS[id] }), h('span', {}, label));
    const btnRun = ctlBtn('run', 'Run', 'Propagate signals automatically (Space)', () => setMode('run'));
    const btnPause = ctlBtn('pause', 'Pause', 'Freeze propagation (Space)', () => setMode('pause'));
    const btnStep = ctlBtn('step', 'Step', 'Advance one gate delay (N)', step);
    const btnReset = ctlBtn('reset', 'Reset', 'Restore default inputs (R)', reset);

    const speed = h('input', { type: 'range', min: 0, max: 800, step: 20, 'aria-label': 'Gate delay animation speed' });
    const speedVal = h('span', { class: 'speed-val mono' });
    speed.addEventListener('input', () => {
      Sim.prefs.speed = Number(speed.value);
      Sim.savePrefs();
      syncSpeed();
    });
    function syncSpeed() {
      speed.value = Sim.prefs.speed;
      speedVal.textContent = Sim.prefs.speed === 0 ? 'Instant' : `${Sim.prefs.speed} ms`;
    }
    syncSpeed();

    const status = h('div', { class: 'sim-status', role: 'status', 'aria-live': 'polite' });
    const meter = h('div', { class: 'level-meter', 'aria-hidden': 'true' });
    const meterText = h('span', { class: 'meter-text mono' });

    const circuitHost = h('div', { class: 'circuit-host' });
    const inputsHost = h('div', { class: 'card-body inputs-host' });
    const outputsHost = h('div', { class: 'card-body outputs-host' });
    const tabBar = h('div', { class: 'tabs', role: 'tablist', 'aria-label': `${def.title} information` });
    const tabPanels = h('div', { class: 'tab-panels' });

    const legend = h('div', { class: 'legend', html:
      '<span><i class="lg hi"></i>HIGH (1)</span><span><i class="lg lo"></i>LOW (0)</span><span><i class="lg pend"></i>Awaiting propagation</span>' });

    const card = (cls, title, head, ...body) =>
      h('article', { class: `card card-${cls}` }, h('header', { class: 'card-head' }, h('h2', {}, title), head || null), ...body);

    const root = h('section', { class: 'workspace view mode-run', id: 'ws-' + def.id, 'aria-label': def.title },
      h('header', { class: 'ws-header' },
        h('div', { class: 'ws-title' },
          h('span', { class: 'exp-badge' }, `Experiment ${def.number}`),
          h('h1', {}, def.title),
          h('p', { class: 'ws-sub' }, def.subtitle)),
        h('div', { class: 'sim-controls' },
          h('div', { class: 'ctl-group', role: 'group', 'aria-label': 'Simulation controls' }, btnRun, btnPause, btnStep, btnReset),
          h('label', { class: 'speed', 'data-tip': 'Animation time per gate delay (0 = instant)' }, h('span', {}, 'Gate delay'), speed, speedVal),
          status)),
      h('div', { class: 'ws-grid' },
        card('circuit', 'Circuit Diagram', legend, circuitHost, h('footer', { class: 'card-foot' }, h('span', { class: 'muted small' }, 'Propagation'), meter, meterText)),
        card('inputs', 'Input Controls', null, inputsHost),
        card('outputs', 'Output Display', null, outputsHost),
        h('article', { class: 'card card-info' }, h('header', { class: 'card-head tabs-head' }, tabBar), tabPanels)));

    /* ----- Tabs ----- */
    const tabs = [];
    let activeTab = Sim.store.get('tab:' + def.id, null);
    function addTab(id, label) {
      const btn = h('button', { type: 'button', role: 'tab', class: 'tab', id: `tab-${def.id}-${id}`, 'aria-controls': `panel-${def.id}-${id}`, onclick: () => selectTab(id) }, label);
      const panel = h('div', { role: 'tabpanel', class: 'tab-panel card-body', id: `panel-${def.id}-${id}`, 'aria-labelledby': btn.id });
      tabBar.append(btn);
      tabPanels.append(panel);
      tabs.push({ id, btn, panel });
      panel.hidden = true;
      btn.setAttribute('aria-selected', 'false');
      btn.tabIndex = -1;
      if (tabs.length === 1 || id === activeTab) selectTab(id, true);
      return panel;
    }
    function selectTab(id, silent) {
      if (!tabs.some((t) => t.id === id)) return;
      activeTab = id;
      tabs.forEach((t) => {
        const on = t.id === id;
        t.btn.classList.toggle('active', on);
        t.btn.setAttribute('aria-selected', String(on));
        t.btn.tabIndex = on ? 0 : -1;
        t.panel.hidden = !on;
      });
      if (!silent) Sim.store.set('tab:' + def.id, id);
    }
    tabBar.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const i = tabs.findIndex((t) => t.id === activeTab);
      const n = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
      selectTab(n.id);
      n.btn.focus();
    });

    /* ----- Context handed to the experiment definition ----- */
    const ctx = {
      def, root, circuitHost, inputsHost, outputsHost,
      get state() { return ws.state; },
      get model() { return ws.model; },
      get shown() { return ws.shown; },
      get displayLevel() { return ws.displayLevel; },
      get resolved() { return ws.displayLevel >= ws.model.maxLevel; },
      get mode() { return ws.mode; },
      setState(patch) {
        ws.state = def.sanitize(Object.assign({}, ws.state, patch));
        Sim.store.set('exp:' + def.id, ws.state);
        recompute();
      },
      addTab,
      selectTab,
      redisplay: () => applyDisplay(new Set(), false),
      sweep,
    };

    /* ----- Propagation engine ----- */
    function recompute() {
      const model = def.compute(ws.state);
      ws.model = model;
      clearTimeout(ws.timer);
      const key = def.structureKey ? def.structureKey(ws.state) : 'fixed';
      if (key !== ws.structureKey) {
        // Structure changed (first render or new bit width): redraw, show settled state.
        ws.structureKey = key;
        circuitHost.replaceChildren();
        def.renderCircuit(circuitHost, ctx);
        ws.shown = Object.assign({}, model.values);
        ws.displayLevel = model.maxLevel;
        buildMeter();
        render(new Set(), false);
        return;
      }
      // Inputs (level 0) change immediately; everything downstream waits.
      ws.displayLevel = 0;
      render(applyUpTo(0), true);
      if (ws.mode === 'run') schedule();
    }

    /** Copies computed values into the displayed map for all signals with level <= `level`. */
    function applyUpTo(level) {
      const changed = new Set();
      const { values, levels } = ws.model;
      for (const sig in values) {
        if (levels[sig] <= level && ws.shown[sig] !== values[sig]) {
          ws.shown[sig] = values[sig];
          changed.add(sig);
        }
      }
      return changed;
    }

    function advance() {
      if (ws.displayLevel >= ws.model.maxLevel) return null;
      ws.displayLevel++;
      return applyUpTo(ws.displayLevel);
    }

    function schedule() {
      clearTimeout(ws.timer);
      if (ws.mode !== 'run' || ws.displayLevel >= ws.model.maxLevel) {
        updateStatus();
        return;
      }
      if (Sim.prefs.speed === 0) {
        const all = new Set();
        let c;
        while ((c = advance())) c.forEach((s) => all.add(s));
        render(all, false);
        return;
      }
      ws.timer = setTimeout(() => {
        const c = advance();
        render(c || new Set(), true);
        schedule();
      }, Sim.prefs.speed);
    }

    function render(changed, animate) {
      def.refresh(ctx);
      applyDisplay(changed, animate);
      updateStatus();
    }

    /** Colours every [data-sig] element from the displayed values. */
    function applyDisplay(changed, animate) {
      const { levels } = ws.model;
      const L = ws.displayLevel;
      const dur = Math.max(240, Sim.prefs.speed * 1.15);
      root.querySelectorAll('[data-sig]').forEach((node) => {
        const sig = node.getAttribute('data-sig');
        const v = ws.shown[sig];
        if (v === undefined) return;
        node.classList.toggle('hi', v === 1);
        node.classList.toggle('lo', v === 0);
        node.classList.toggle('pending', (levels[sig] || 0) > L);
        if (animate && Sim.prefs.speed > 0 && changed.has(sig) && node.classList.contains('wire')) Sim.Svg.playTravel(node, dur);
      });
      root.querySelectorAll('[data-sig-text]').forEach((n) => {
        const v = ws.shown[n.getAttribute('data-sig-text')];
        if (v !== undefined && n.textContent !== String(v)) n.textContent = v;
      });
      root.querySelectorAll('[data-level]').forEach((n) => {
        const l = Number(n.getAttribute('data-level'));
        n.classList.toggle('done', l <= L);
        n.classList.toggle('next', l === L + 1 && L < ws.model.maxLevel);
      });
      // level meter
      const segs = meter.children;
      for (let i = 0; i < segs.length; i++) segs[i].classList.toggle('on', i <= L);
      meterText.textContent = `t = ${L} / ${ws.model.maxLevel} gate delays`;
    }

    function buildMeter() {
      meter.replaceChildren();
      for (let i = 0; i <= ws.model.maxLevel; i++) meter.append(h('i', { title: `t = ${i}` }));
    }

    function updateStatus() {
      const settled = ws.displayLevel >= ws.model.maxLevel;
      const modeText = { run: 'Running', pause: 'Paused', step: 'Step mode' }[ws.mode];
      status.className = 'sim-status ' + (settled ? 'settled' : 'busy');
      status.innerHTML = `<i class="dot"></i><b>${modeText}</b><span>${settled ? 'Outputs settled' : 'Propagating…'}</span>`;
      root.classList.toggle('mode-run', ws.mode === 'run');
      root.classList.toggle('mode-paused', ws.mode !== 'run');
      btnRun.classList.toggle('active', ws.mode === 'run');
      btnPause.classList.toggle('active', ws.mode === 'pause');
      btnStep.classList.toggle('active', ws.mode === 'step');
    }

    function setMode(m) {
      ws.mode = m;
      clearTimeout(ws.timer);
      if (m === 'run') schedule();
      updateStatus();
    }

    function step() {
      ws.mode = 'step';
      clearTimeout(ws.timer);
      const c = advance();
      if (c) render(c, true);
      else {
        updateStatus();
        Sim.toast('Circuit has settled — change an input to propagate a new value.');
      }
    }

    function reset() {
      ws.sweeping = false;
      ws.state = def.defaultState();
      Sim.store.set('exp:' + def.id, ws.state);
      if (def.onReset) def.onReset(ctx);
      ws.mode = 'run';
      recompute();
      Sim.toast(`${def.title}: inputs reset to defaults.`);
    }

    /** Animated truth-table sweep: applies each row, waits until settled, checks the DISPLAYED outputs. */
    async function sweep(rows, { apply, check, mark, onDone }) {
      if (ws.sweeping) {
        ws.sweeping = false;
        return;
      }
      ws.sweeping = true;
      setMode('run');
      let allOk = true;
      for (const row of rows) {
        if (!ws.sweeping) break;
        apply(row);
        while (ws.sweeping && ws.displayLevel < ws.model.maxLevel) await Sim.sleep(30);
        await Sim.sleep(Math.max(220, Sim.prefs.speed));
        if (!ws.sweeping) break;
        const ok = check(row, ws.shown);
        allOk = allOk && ok;
        mark(row, ok);
      }
      const completed = ws.sweeping;
      ws.sweeping = false;
      if (onDone) onDone(completed, allOk);
    }

    /**
     * Self-check used by the diagnostics (window.DLS.selfTest()):
     * every drawn signal must exist in the netlist and its colour must
     * equal the computed logic value once settled.
     */
    function selfCheck() {
      const problems = [];
      if (ws.displayLevel < ws.model.maxLevel) problems.push('circuit not settled');
      root.querySelectorAll('[data-sig]').forEach((n) => {
        const s = n.getAttribute('data-sig');
        const v = ws.model.values[s];
        if (v === undefined) {
          problems.push(`drawn element references unknown signal "${s}"`);
          return;
        }
        const shown = n.classList.contains('hi') ? 1 : n.classList.contains('lo') ? 0 : null;
        if (shown !== v) problems.push(`${s}: displayed ${shown} but logic value is ${v}`);
        if (n.classList.contains('pending')) problems.push(`${s} still marked pending`);
      });
      if (def.verify) problems.push(...def.verify(ws.model, ws.state));
      return problems;
    }

    /* ----- Mount ----- */
    def.mount(ctx);
    recompute();

    return {
      def, root, ctx,
      activate() {
        syncSpeed();
        if (def.onActivate) def.onActivate(ctx);
      },
      togglePlay: () => setMode(ws.mode === 'run' ? 'pause' : 'run'),
      step,
      reset,
      handleKey(key) {
        const fn = def.keys && def.keys[key];
        if (fn) {
          fn(ctx);
          return true;
        }
        return false;
      },
      /** For diagnostics: replace state wholesale and settle instantly. */
      setStateNow(s) {
        ws.state = def.sanitize(s);
        ws.mode = 'run';
        const prev = Sim.prefs.speed;
        Sim.prefs.speed = 0;
        recompute();
        Sim.prefs.speed = prev;
      },
      getState: () => ws.state,
      selfCheck,
    };
  };
})();
