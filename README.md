# 8086 Digital Logic Simulator

An interactive, browser-based laboratory for five digital arithmetic experiments:

1. **Half Adder** — XOR + AND
2. **Full Adder** — 2 XOR, 2 AND, 1 OR, with intermediate signals
3. **Binary Adder** — 4 / 8 / 16-bit ripple-carry adder with a gate-level stage inspector
4. **Carry Look-Ahead Adder** — 4 / 8-bit, generate/propagate cells and a parallel AND–OR carry network, plus an RCA-vs-CLA timing race
5. **Parallel Adder / Subtractor** — 4 / 8-bit, XOR-controlled inversion, two's complement, carry and overflow

It also includes a **Connection with Intel 8086** section, with an interactive ADD/SUB flags demo (CF, OF, ZF, SF, PF, AF).

No backend, no build step, no external libraries or services. Only plain HTML, CSS, JavaScript and SVG.

## Running it

**Option 1: open the file.** Double-click `index.html`. Everything works from `file://` because no ES modules or fetches are used.

**Option 2: local web server** (recommended for development):

```bash
python3 -m http.server 8086
```

Then open <http://localhost:8086>.

## Running the tests

The logic engine has no DOM dependency and is tested with Node (no packages needed):

```bash
node tests/logic.test.js
```

The suite covers all half-adder and full-adder rows, exhaustive 4-bit and 8-bit addition, 20,000 random 16-bit additions, CLA carry equations vs arithmetic, positive and negative subtraction, overflow cases, input validation and the 8086 flag rules.

In the browser, open the developer console and run:

```js
DLS.selfTest()
```

It drives test inputs through all five experiments, then checks three things:

1. Every drawn wire, gate and terminal maps to a real netlist signal, so nothing is decorative.
2. Every element's colour (HIGH/LOW) equals the computed logic value once settled.
3. Every output equals the reference arithmetic.

## How it works

- **Gate-level netlists** (`js/logic.js`): each circuit is a list of gates with named signals. Evaluating a netlist gives every signal's value and its *arrival time* (longest gate path, in unit gate delays).
- **Diagrams** (`js/svg.js` and the experiment files): every SVG wire, gate and pin carries `data-sig="<signal>"`. The workspace engine colours them from the evaluated netlist.
- **Propagation model** (`js/components.js`): after an input changes, signals are revealed one gate delay at a time. Signals not reached yet keep their old value and are drawn dashed amber. **Run / Pause / Step / Reset** control this.
- **Reference arithmetic** (`rippleCarryAdd`, `claAdd`, `addSubtract`, `flags8086`) is written independently. It drives the step-by-step explanations and is cross-checked against the netlists by the tests.

## Project structure

```
index.html                 App shell + Home, Documentation, 8086 and About pages
css/styles.css             Dark laboratory theme, circuit/signal styles, responsive layout
js/logic.js                Gates, netlists, arithmetic, 8086 flags (no DOM; also used by Node tests)
js/svg.js                  SVG helpers: gates, wires, junctions, pins, signal pulse animation
js/components.js           Toggle, binary input, truth table, step list, workspace engine
js/experiments/
  halfAdder.js             Experiment 1
  fullAdder.js             Experiment 2 (also exports the reusable full-adder diagram)
  binaryAdder.js           Experiment 3
  cla.js                   Experiment 4
  addSub.js                Experiment 5
js/pages.js                Home page cards, 8086 flags demo
js/app.js                  Hash router, sidebar, keyboard shortcuts, DLS.selfTest()
tests/logic.test.js        Node test-suite
```

## Using the simulator

| Control | Key | Action |
|---|---|---|
| Run | Space | Propagate automatically after each input change |
| Pause | Space | Freeze propagation |
| Step | N | Advance one gate delay |
| Reset | R | Restore the experiment's default inputs |
| Toggle inputs | A, B, C (HA/FA), M (add/sub mode) | Flip an input |

- Input terminals in the diagrams are clickable. In the multi-bit experiments, clicking an `Ai` or `Bi` terminal flips that bit.
- **Custom input:** each number box has a **BIN / DEC / HEX** switch, so you can type values in binary (`1011`, `0b1011`), decimal (`11`; negative values such as `-3` in the adder/subtractor and the 8086 demo, stored as two's complement) or hexadecimal (`0xB`, `0Bh`). Invalid characters or values that don't fit the bit width show an error, and the last valid value is kept. ↑/↓ increment and decrement.
- Each experiment remembers its inputs (in `localStorage`) when you switch between experiments or reload.

## Lab reports (LLT 1)

`reports/Report 1.pdf` / `Report 1.docx` and `reports/Report 2.pdf` / `Report 2.docx` (PDF and editable Word versions) are complete lab reports for all five experiments. They contain the aim, theory, Boolean expressions, logic diagram, truth tables, procedure, output screenshot, observation, and result and conclusion. Each report uses a different set of inputs, so the two reports show different outputs. The individual screenshots are in `reports/screenshots/`.

To regenerate both reports, for example after changing the input sets in `SETS` at the top of the script:

```bash
cd tools && npm install && cd ..
```

```bash
node tools/build-reports.mjs
```

The first command is needed only once; it installs the `docx` package used for the Word files. The script drives the installed Google Chrome in headless mode to set the inputs, run the truth-table verification, capture the screenshots, print the PDFs and write the Word documents.

## Screenshot-only output files

`outputs/output1.docx` … `outputs/output5.docx` contain only simulator screenshots. Each file has one full screenshot per experiment (circuit, input controls, output display and table) and uses a different input set. Sets 1 and 2 are the ones used in the reports. To regenerate them, run:

```bash
node tools/build-outputs.mjs
```

## Themed Word report

`coa/coa1.docx` is the practical-assignment report in a teal and amber theme, with Georgia and Trebuchet MS fonts. Page 1 reproduces the SRM cover with the Name, Register No. and Section fields left blank. The content follows the expanded reference report and uses observation set 1. To regenerate it, run:

```bash
node tools/build-coa.mjs
```

## Notes and limitations

- Timing uses a unit-delay, structural (worst-case) model: ripple carry-out takes 2n + 1 gate delays, and the CLA's carries take 3 and its sums 4.
- The CLA is single-level with unlimited fan-in, as in the textbook equations. The comparison tab explains why practical designs use hierarchical 4-bit blocks.
- **8086 clarification:** these are digital arithmetic circuit simulations, not an 8086 instruction-set emulator. They do not reproduce the 8086's transistor-level or microarchitectural ALU design. The 8086 section explains how the same arithmetic and flag rules apply to instructions such as ADD, ADC, SUB, SBB, CMP and NEG.
