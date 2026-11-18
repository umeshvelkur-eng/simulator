/**
 * svg.js — Helpers for drawing logic-circuit diagrams in SVG.
 *
 * Every drawable that represents a signal carries a `data-sig="<name>"`
 * attribute. The workspace engine (components.js) colours those elements
 * HIGH / LOW / pending from the evaluated netlist, so diagrams can never
 * drift away from the real calculation.
 */
(function () {
  'use strict';
  const Sim = (window.Sim = window.Sim || {});
  const NS = 'http://www.w3.org/2000/svg';

  function el(tag, attrs, parent) {
    const node = document.createElementNS(NS, tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v === undefined || v === null || v === false) continue;
        if (k === 'text') node.textContent = v;
        else node.setAttribute(k, v);
      }
    }
    if (parent) parent.appendChild(node);
    return node;
  }

  /* ---------------- Gate geometry (local coordinates) ----------------
   * Every gate is drawn in a 64 x 44 box: inputs on the left edge,
   * output on the right edge at y = 22. Gates can be translated, rotated
   * and scaled; pin positions are transformed accordingly.            */
  const GW = 64;
  const GH = 44;
  const BODY = {
    AND: 'M0 0 H42 A22 22 0 0 1 42 44 H0 Z',
    OR: 'M0 0 Q38 0 64 22 Q38 44 0 44 Q13 22 0 0 Z',
    XOR: 'M0 0 Q38 0 64 22 Q38 44 0 44 Q13 22 0 0 Z',
    NOT: 'M0 2 L48 22 L0 42 Z',
  };
  /** Horizontal inset where an input wire meets the curved back of OR/XOR. */
  const INSET = { AND: 0, OR: 6, XOR: 6, NOT: 0 };

  const round = (v) => Math.round(v * 100) / 100;

  function inputOffsets(n) {
    if (n === 1) return [GH / 2];
    const gap = Math.min(20, 36 / (n - 1));
    const start = GH / 2 - (gap * (n - 1)) / 2;
    return Array.from({ length: n }, (_, i) => start + i * gap);
  }

  /** Local gate point -> global SVG point. */
  function transformPoint(spec, lx, ly) {
    const s = spec.scale || 1;
    const r = ((spec.rot || 0) * Math.PI) / 180;
    const x = lx * s;
    const y = ly * s;
    return [round(spec.x + x * Math.cos(r) - y * Math.sin(r)), round(spec.y + x * Math.sin(r) + y * Math.cos(r))];
  }

  function gatePins(spec) {
    const n = spec.inputs || (spec.type === 'NOT' ? 1 : 2);
    return {
      in: inputOffsets(n).map((o) => transformPoint(spec, INSET[spec.type], o)),
      out: transformPoint(spec, spec.type === 'NOT' ? 58 : GW, GH / 2),
    };
  }

  /**
   * Draws a gate. spec = { type, x, y, rot?, scale?, sig, label?, tip? }
   * `sig` is the gate's OUTPUT signal: the gate glows when it outputs 1.
   * Returns pin coordinates { in:[[x,y],...], out:[x,y] }.
   */
  function gate(parent, spec) {
    const g = el('g', {
      class: 'gate',
      'data-sig': spec.sig,
      transform: `translate(${spec.x} ${spec.y}) rotate(${spec.rot || 0}) scale(${spec.scale || 1})`,
    }, parent);
    el('title', { text: spec.tip || `${spec.type} gate → ${spec.sig}` }, g);
    if (spec.type === 'XOR') el('path', { d: 'M-8 0 Q5 22 -8 44', class: 'gate-arc' }, g);
    el('path', { d: BODY[spec.type], class: 'gate-body' }, g);
    if (spec.type === 'NOT') el('circle', { cx: 53, cy: 22, r: 5, class: 'gate-body' }, g);
    if (spec.label !== false) {
      const c = transformPoint(spec, spec.type === 'NOT' ? 16 : 27, GH / 2);
      el('text', {
        x: c[0], y: c[1],
        class: 'gate-label' + ((spec.scale || 1) < 0.9 ? ' sm' : ''),
        'text-anchor': 'middle', 'dominant-baseline': 'central',
        text: spec.label || spec.type,
      }, parent);
    }
    return gatePins(spec);
  }

  /* ---------------- Wires ---------------- */
  const pathD = (pts) => pts.map((p, i) => `${i ? 'L' : 'M'}${p[0]} ${p[1]}`).join(' ');

  /**
   * Orthogonal wire through the given points. Three stacked paths:
   *  base   – the copper colour (HIGH = green, LOW = grey)
   *  flow   – moving dashes while the simulation runs and the signal is HIGH
   *  travel – a one-shot pulse that sweeps along the wire when its value changes
   */
  function wire(parent, sig, pts, title) {
    const g = el('g', { class: 'wire', 'data-sig': sig }, parent);
    const d = pathD(pts);
    el('path', { d, class: 'wire-base' }, g);
    el('path', { d, class: 'wire-flow' }, g);
    el('path', { d, class: 'wire-travel' }, g);
    el('title', { text: title || `Signal ${sig}` }, g);
    return g;
  }

  /** Junction dot where a wire branches. */
  function dot(parent, sig, x, y) {
    return el('circle', { cx: x, cy: y, r: 4.5, class: 'junction', 'data-sig': sig }, parent);
  }

  /**
   * Input or output pin (round terminal showing its 0/1 value).
   * opts = { sig, x, y, label, r, labelPos:'left'|'right'|'top'|'bottom', onToggle, kind:'in'|'out', tip }
   */
  function pin(parent, opts) {
    const { sig, x, y, label, r = 14, labelPos = 'left', onToggle, kind = 'in', tip } = opts;
    const g = el('g', { class: `pin pin-${kind}` + (onToggle ? ' clickable' : ''), 'data-sig': sig }, parent);
    if (onToggle) {
      g.setAttribute('tabindex', '0');
      g.setAttribute('role', 'button');
      g.setAttribute('aria-label', `Toggle input ${label}`);
      g.addEventListener('click', onToggle);
      g.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onToggle();
        }
      });
    }
    el('title', { text: tip || (onToggle ? `${label} — click to toggle` : label) }, g);
    if (kind === 'out') el('circle', { cx: x, cy: y, r: r + 5, class: 'pin-halo' }, g);
    el('circle', { cx: x, cy: y, r, class: 'pin-body' }, g);
    el('text', {
      x, y, class: 'pin-val' + (r < 12 ? ' sm' : ''), 'data-sig-text': sig,
      'text-anchor': 'middle', 'dominant-baseline': 'central', text: '0',
    }, g);
    if (label) {
      const off = r + 8;
      const pos = {
        left: [x - off, y, 'end'],
        right: [x + off + (kind === 'out' ? 4 : 0), y, 'start'],
        top: [x, y - off - 3, 'middle'],
        bottom: [x, y + off + 5, 'middle'],
      }[labelPos];
      el('text', {
        x: pos[0], y: pos[1], class: 'pin-label' + (r < 12 ? ' sm' : ''),
        'text-anchor': pos[2], 'dominant-baseline': 'central', text: label,
      }, g);
    }
    return g;
  }

  function label(parent, x, y, text, cls, anchor) {
    return el('text', { x, y, class: cls || 'sig-label', 'text-anchor': anchor || 'middle', 'dominant-baseline': 'central', text }, parent);
  }

  /** Creates a responsive <svg> with a viewBox and ordered drawing layers. */
  function create(host, width, height, title, opts) {
    const svg = el('svg', {
      class: 'circuit' + (opts && opts.cls ? ' ' + opts.cls : ''),
      viewBox: `0 0 ${width} ${height}`,
      role: 'img',
      'aria-label': title,
      preserveAspectRatio: 'xMidYMid meet',
    }, host);
    if (opts && opts.minWidth) svg.style.minWidth = opts.minWidth + 'px';
    el('title', { text: title }, svg);
    const layers = {
      back: el('g', { class: 'layer-back' }, svg),
      wires: el('g', { class: 'layer-wires' }, svg),
      dots: el('g', { class: 'layer-dots' }, svg),
      gates: el('g', { class: 'layer-gates' }, svg),
      pins: el('g', { class: 'layer-pins' }, svg),
      labels: el('g', { class: 'layer-labels' }, svg),
    };
    return { svg, ...layers };
  }

  /**
   * Plays the one-shot "signal travelling" pulse along a wire group.
   * Uses the Web Animations API; silently skipped if unavailable.
   */
  function playTravel(wireGroup, duration) {
    const p = wireGroup.querySelector('.wire-travel');
    if (!p || typeof p.animate !== 'function') return;
    let len = Number(p.getAttribute('data-len'));
    if (!len) {
      try {
        len = p.getTotalLength();
      } catch (e) {
        len = 0;
      }
      if (!len) return;
      p.setAttribute('data-len', len);
    }
    const dash = Math.max(10, len * 0.35);
    p.style.strokeDasharray = `${dash} ${len * 3}`;
    p.animate(
      [
        { strokeDashoffset: dash, opacity: 1 },
        { strokeDashoffset: -len, opacity: 0.9 },
      ],
      { duration, easing: 'ease-in-out' }
    );
  }

  Sim.Svg = { el, gate, gatePins, wire, dot, pin, label, create, playTravel, transformPoint };
})();
