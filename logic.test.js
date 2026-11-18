/**
 * Logic test-suite — run with:  node tests/logic.test.js
 * No dependencies. Covers every item of the project's validation checklist
 * that can be checked without a browser.
 */
'use strict';
const assert = require('assert');
const path = require('path');
const L = require(path.join(__dirname, '..', 'js', 'logic.js'));

let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    console.log(`  ✗ ${name}\n      ${err.message}`);
  }
}
function section(title) {
  console.log(`\n${title}`);
}

// Deterministic pseudo-random generator so failures are reproducible.
let seed = 12345;
const rand = (max) => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed % (max + 1);
};

/* ------------------------------------------------------------------ */
section('1. Half adder');
test('all 4 truth-table rows (function and gate-level netlist)', () => {
  const expected = [
    [0, 0, 0, 0],
    [0, 1, 1, 0],
    [1, 0, 1, 0],
    [1, 1, 0, 1],
  ];
  const net = L.halfAdderNetlist();
  for (const [A, B, S, C] of expected) {
    const f = L.halfAdder(A, B);
    assert.deepStrictEqual([f.sum, f.carry], [S, C], `function A=${A} B=${B}`);
    const n = L.evaluateNetlist(net, { A, B });
    assert.deepStrictEqual([n.values.S, n.values.C], [S, C], `netlist A=${A} B=${B}`);
    assert.strictEqual(n.maxLevel, 1, 'half adder is one gate deep');
  }
});

/* ------------------------------------------------------------------ */
section('2. Full adder');
test('all 8 truth-table rows equal A+B+Cin', () => {
  const net = L.fullAdderNetlist();
  for (let A = 0; A <= 1; A++)
    for (let B = 0; B <= 1; B++)
      for (let Cin = 0; Cin <= 1; Cin++) {
        const total = A + B + Cin;
        const f = L.fullAdder(A, B, Cin);
        assert.strictEqual(f.sum, total & 1);
        assert.strictEqual(f.cout, total >> 1);
        const n = L.evaluateNetlist(net, { A, B, Cin });
        assert.strictEqual(n.values.S, total & 1, `S for ${A}${B}${Cin}`);
        assert.strictEqual(n.values.Cout, total >> 1, `Cout for ${A}${B}${Cin}`);
        assert.strictEqual(n.values.P, A ^ B);
        assert.strictEqual(n.values.G, A & B);
        assert.strictEqual(n.values.T, (A ^ B) & Cin);
      }
});
test('worked example A=1 B=1 Cin=0 -> Sum 0, Carry 1', () => {
  const f = L.fullAdder(1, 1, 0);
  assert.deepStrictEqual({ p: f.p, sum: f.sum, g: f.g, t: f.t, cout: f.cout }, { p: 0, sum: 0, g: 1, t: 0, cout: 1 });
});
test('gate depth: S at level 2, Cout at level 3', () => {
  const n = L.evaluateNetlist(L.fullAdderNetlist(), { A: 1, B: 0, Cin: 1 });
  assert.strictEqual(n.levels.S, 2);
  assert.strictEqual(n.levels.Cout, 3);
});

/* ------------------------------------------------------------------ */
section('3. Binary (ripple-carry) adder');
test('example 1011 + 0110 = 10001', () => {
  const r = L.rippleCarryAdd(0b1011, 0b0110, 4);
  assert.strictEqual(L.toBin(r.total, 5), '10001');
  assert.strictEqual(r.cout, 1);
  assert.deepStrictEqual(r.carries, [0, 0, 1, 1, 1]);
});
function checkRipple(a, b, width, cin) {
  const expected = a + b + cin;
  const r = L.rippleCarryAdd(a, b, width, cin);
  assert.strictEqual(r.total, expected, `function ${a}+${b}+${cin} (${width}-bit)`);
  const net = nets.ripple[width];
  const n = L.evaluateNetlist(net, L.wordInputs(a, b, width, { C0: cin }));
  const sum = L.readWord(n.values, 'S', width) + n.values[`C${width}`] * 2 ** width;
  assert.strictEqual(sum, expected, `netlist ${a}+${b}+${cin} (${width}-bit)`);
}
const nets = { ripple: {}, cla: {}, addsub: {} };
for (const w of [4, 8, 16]) nets.ripple[w] = L.rippleAdderNetlist(w);
for (const w of [4, 8]) {
  nets.cla[w] = L.claNetlist(w);
  nets.addsub[w] = L.addSubNetlist(w);
}
test('4-bit: exhaustive (512 cases incl. Cin)', () => {
  for (let a = 0; a < 16; a++) for (let b = 0; b < 16; b++) for (let c = 0; c <= 1; c++) checkRipple(a, b, 4, c);
});
test('8-bit: exhaustive (131072 cases incl. Cin)', () => {
  for (let a = 0; a < 256; a++) for (let b = 0; b < 256; b++) for (let c = 0; c <= 1; c++) checkRipple(a, b, 8, c);
});
test('16-bit: 20000 random cases + edge cases', () => {
  const edge = [[0, 0], [0xffff, 1], [0xffff, 0xffff], [0x8000, 0x8000], [0x7fff, 1], [0x1234, 0xedcb]];
  for (const [a, b] of edge) for (let c = 0; c <= 1; c++) checkRipple(a, b, 16, c);
  for (let i = 0; i < 20000; i++) checkRipple(rand(0xffff), rand(0xffff), 16, rand(1));
});
test('ripple delay: Cn arrives at 2n+1, MSB sum at 2n gate delays', () => {
  for (const w of [4, 8, 16]) {
    const n = L.evaluateNetlist(nets.ripple[w], L.wordInputs(0, 0, w, { C0: 0 }));
    assert.strictEqual(n.levels[`C${w}`], 2 * w + 1);
    assert.strictEqual(n.levels[`S${w - 1}`], 2 * w);
    assert.strictEqual(n.levels[`C${w}`], L.delayModel(w).rca.carryOut);
  }
});

/* ------------------------------------------------------------------ */
section('4. Carry look-ahead adder');
test('parallel (expanded) carries == recursive carries == ripple carries, 4 & 8 bit exhaustive', () => {
  for (const w of [4, 8]) {
    for (let a = 0; a < 2 ** w; a++)
      for (let b = 0; b < 2 ** w; b++)
        for (let c = 0; c <= 1; c++) {
          const cla = L.claAdd(a, b, w, c);
          const rca = L.rippleCarryAdd(a, b, w, c);
          assert.deepStrictEqual(cla.carries, cla.recursive);
          assert.deepStrictEqual(cla.carries, rca.carries);
          assert.strictEqual(cla.sum + cla.cout * 2 ** w, a + b + c);
        }
  }
});
test('CLA netlist matches arithmetic, 4 & 8 bit exhaustive', () => {
  for (const w of [4, 8]) {
    for (let a = 0; a < 2 ** w; a++)
      for (let b = 0; b < 2 ** w; b++)
        for (let c = 0; c <= 1; c++) {
          const n = L.evaluateNetlist(nets.cla[w], L.wordInputs(a, b, w, { C0: c }));
          const total = L.readWord(n.values, 'S', w) + n.values[`C${w}`] * 2 ** w;
          assert.strictEqual(total, a + b + c, `${a}+${b}+${c}`);
          for (let i = 0; i < w; i++) {
            assert.strictEqual(n.values[`G${i}`], ((a >> i) & 1) & ((b >> i) & 1));
            assert.strictEqual(n.values[`P${i}`], ((a >> i) & 1) ^ ((b >> i) & 1));
          }
        }
  }
});
test('the four textbook equations C1..C4 hold', () => {
  for (let a = 0; a < 16; a++)
    for (let b = 0; b < 16; b++)
      for (let c = 0; c <= 1; c++) {
        const { g, p, carries: C } = L.claAdd(a, b, 4, c);
        assert.strictEqual(C[1], g[0] | (p[0] & c));
        assert.strictEqual(C[2], g[1] | (p[1] & C[1]));
        assert.strictEqual(C[3], g[2] | (p[2] & C[2]));
        assert.strictEqual(C[4], g[3] | (p[3] & C[3]));
      }
});
test('CLA timing: every carry at 3 gate delays, sums at <= 4 (independent of width)', () => {
  for (const w of [4, 8]) {
    const n = L.evaluateNetlist(nets.cla[w], L.wordInputs(5, 9, w, { C0: 1 }));
    for (let j = 1; j <= w; j++) assert.strictEqual(n.levels[`C${j}`], 3, `C${j}`);
    assert.strictEqual(n.maxLevel, 4);
  }
});
test('no carry gate in the CLA netlist uses another look-ahead carry as input', () => {
  for (const w of [4, 8]) {
    for (const gate of nets.cla[w].gates) {
      if (gate.id.startsWith('CO_') || gate.id.startsWith('TA_')) {
        for (const s of gate.in) assert.ok(!/^C[1-9]/.test(s), `${gate.id} depends on ${s}`);
      }
    }
  }
});

/* ------------------------------------------------------------------ */
section('5. Parallel adder / subtractor');
const signedOverflow = (a, b, w, mode) => {
  const sa = L.toSigned(a, w);
  const sb = L.toSigned(b, w);
  const exact = mode ? sa - sb : sa + sb;
  return exact < -(2 ** (w - 1)) || exact > 2 ** (w - 1) - 1 ? 1 : 0;
};
test('exhaustive 4 & 8 bit, both modes: result, carry, overflow, netlist', () => {
  for (const w of [4, 8]) {
    const mod = 2 ** w;
    for (let a = 0; a < mod; a++)
      for (let b = 0; b < mod; b++)
        for (let mode = 0; mode <= 1; mode++) {
          const r = L.addSubtract(a, b, w, mode);
          const expected = mode ? (a - b + mod) % mod : (a + b) % mod;
          assert.strictEqual(r.result, expected);
          assert.strictEqual(r.overflow, signedOverflow(a, b, w, mode), `V ${a}${mode ? '-' : '+'}${b}`);
          if (mode) assert.strictEqual(r.cout, a >= b ? 1 : 0, 'SUB carry-out = NOT borrow');
          else assert.strictEqual(r.cout, a + b >= mod ? 1 : 0);
          const n = L.evaluateNetlist(nets.addsub[w], L.wordInputs(a, b, w, { M: mode }));
          assert.strictEqual(L.readWord(n.values, 'S', w), expected);
          assert.strictEqual(n.values[`C${w}`], r.cout);
          assert.strictEqual(n.values.V, r.overflow);
          assert.strictEqual(L.readWord(n.values, 'X', w), r.bx);
        }
  }
});
test('positive subtraction 5 - 3 = 2 (4-bit)', () => {
  const r = L.addSubtract(5, 3, 4, 1);
  assert.strictEqual(L.toBin(r.bx, 4), '1100');
  assert.strictEqual(r.signedResult, 2);
  assert.strictEqual(r.cout, 1);
  assert.strictEqual(r.overflow, 0);
});
test('negative subtraction 3 - 5 = -2 -> 1110 (4-bit)', () => {
  const r = L.addSubtract(3, 5, 4, 1);
  assert.strictEqual(L.toBin(r.result, 4), '1110');
  assert.strictEqual(r.signedResult, -2);
  assert.strictEqual(r.cout, 0, 'carry-out 0 means a borrow occurred');
  assert.strictEqual(r.overflow, 0);
});
test('overflow cases: 7+1, -8-1 (4-bit); 127+1, -128-1 (8-bit)', () => {
  assert.strictEqual(L.addSubtract(7, 1, 4, 0).overflow, 1);
  assert.strictEqual(L.addSubtract(8, 1, 4, 1).overflow, 1);
  assert.strictEqual(L.addSubtract(127, 1, 8, 0).overflow, 1);
  assert.strictEqual(L.addSubtract(128, 1, 8, 1).overflow, 1);
  assert.strictEqual(L.addSubtract(0xff, 1, 8, 0).overflow, 0, '-1 + 1 is not a signed overflow');
});

/* ------------------------------------------------------------------ */
section('6. Input validation and conversions');
test('parseBinary accepts valid input and rejects invalid input', () => {
  assert.deepStrictEqual(L.parseBinary('1011', 4).value, 11);
  assert.strictEqual(L.parseBinary('0b10_11', 4).value, 11);
  assert.strictEqual(L.parseBinary(' 1010 1010 ', 8).value, 170);
  assert.strictEqual(L.parseBinary('', 4).ok, false);
  assert.strictEqual(L.parseBinary('10201', 8).ok, false);
  assert.strictEqual(L.parseBinary('abc', 8).ok, false);
  assert.strictEqual(L.parseBinary('10110', 4).ok, false);
});
test('parseDecimal: ranges, negatives (two\'s complement) and bad input', () => {
  assert.strictEqual(L.parseDecimal('13', 4).value, 13);
  assert.strictEqual(L.parseDecimal(' 1,000 ', 16).value, 1000);
  assert.strictEqual(L.parseDecimal('-3', 4, true).value, 0b1101);
  assert.strictEqual(L.parseDecimal('-8', 4, true).value, 0b1000);
  assert.strictEqual(L.parseDecimal('-9', 4, true).ok, false, 'below -2^(n-1)');
  assert.strictEqual(L.parseDecimal('-3', 4, false).ok, false, 'negatives only where signed');
  assert.strictEqual(L.parseDecimal('16', 4).ok, false, 'above 2^n - 1');
  assert.strictEqual(L.parseDecimal('65535', 16).value, 65535);
  assert.strictEqual(L.parseDecimal('12a', 8).ok, false);
  assert.strictEqual(L.parseDecimal('', 8).ok, false);
  assert.strictEqual(L.parseDecimal('-', 8, true).ok, false);
});
test('parseHex: prefixes, case, range and bad input', () => {
  assert.strictEqual(L.parseHex('0xB', 4).value, 11);
  assert.strictEqual(L.parseHex('ff', 8).value, 255);
  assert.strictEqual(L.parseHex('7Fh', 8).value, 127);
  assert.strictEqual(L.parseHex('BE EF', 16).value, 0xbeef);
  assert.strictEqual(L.parseHex('1F', 4).ok, false);
  assert.strictEqual(L.parseHex('0xG1', 8).ok, false);
  assert.strictEqual(L.parseHex('', 8).ok, false);
});
test('conversions', () => {
  assert.strictEqual(L.toHex(0xbeef, 16), '0xBEEF');
  assert.strictEqual(L.toHex(5, 8), '0x05');
  assert.strictEqual(L.toSigned(0b1110, 4), -2);
  assert.strictEqual(L.groupBits('10110110'), '1011 0110');
  assert.strictEqual(L.groupBits('10001'), '1 0001');
});

/* ------------------------------------------------------------------ */
section('7. 8086 flag calculation (educational)');
test('ADD 7Fh + 01h -> 80h, OF=1 SF=1 AF=1 CF=0 ZF=0', () => {
  const f = L.flags8086(0x7f, 0x01, 8, 'ADD');
  assert.deepStrictEqual([f.result, f.OF, f.SF, f.AF, f.CF, f.ZF, f.PF], [0x80, 1, 1, 1, 0, 0, 0]);
});
test('ADD FFh + 01h -> 00h, CF=1 ZF=1 PF=1 AF=1', () => {
  const f = L.flags8086(0xff, 0x01, 8, 'ADD');
  assert.deepStrictEqual([f.result, f.CF, f.ZF, f.PF, f.AF, f.OF], [0, 1, 1, 1, 1, 0]);
});
test('SUB 00h - 01h -> FFh, CF(borrow)=1, adder carry-out=0', () => {
  const f = L.flags8086(0x00, 0x01, 8, 'SUB');
  assert.deepStrictEqual([f.result, f.CF, f.SF, f.adderCarryOut], [0xff, 1, 1, 0]);
});
test('8086 CF on SUB is always the inverse of the adder carry-out (16-bit random)', () => {
  for (let i = 0; i < 5000; i++) {
    const a = rand(0xffff);
    const b = rand(0xffff);
    const f = L.flags8086(a, b, 16, 'SUB');
    assert.strictEqual(f.CF, 1 - f.adderCarryOut);
    assert.strictEqual(f.OF, f.adderOverflow);
  }
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
