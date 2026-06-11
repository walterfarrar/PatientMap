# PatientMap

A browser-based clinical reasoning game about acute stroke recognition, built around the **BEFAST** screen (Balance · Eyes · Face · Arms · Speech · Time).

**Play it:** https://walterfarrar.github.io/PatientMap/

## How it plays

You're at the bedside of a patient with a sudden change. Starting from a single node, you expand a live "mind map" of the encounter:

1. **Tap a node** to act — talk to the patient or family, perform a focused exam maneuver, or run a bedside test.
2. Each action reveals **new nodes** branching off it, and many produce a **clinical finding**.
3. In **Collected Data**, tag each finding to the BEFAST category it documents. Wrong tags get gentle pushback; supporting data (vitals, history, mimic rule-outs) is filed automatically.
4. When your documentation is strong enough, trigger the **STROKE ALERT**. Activate too early and the stroke team pushes back with specific feedback on what's missing — every node stays revisitable, so keep digging.

To accept an activation you need:

- A tagged **Time** (last known well) data point
- At least **two** objective BEFAST deficits (B/E/F/A/S)
- The most common stroke mimic ruled out (you'll figure it out)

Findings use realistic clinical language (NIHSS-style exam descriptions), aimed at nursing, EMS, and medical learners.

## Tech

Plain HTML/CSS/JavaScript — no build step, no dependencies. The node map is rendered as SVG with pan/zoom.

- `js/case-data.js` — the case file: a declarative graph of nodes, findings, and stroke-alert criteria. Cases are data, not code; see the schema comment at the top of the file to author new ones.
- `js/main.js` — the engine: tree layout, SVG rendering, discovery state, BEFAST tagging, alert evaluation.
- `css/style.css` — dark medical-monitor theme.

### Run locally

Open `index.html` in a browser. That's it.

## Adding cases

Copy the shape of `CASE_001` in `js/case-data.js`: each node declares its `actionLabel` (what the locked node offers), `content` (narration / patient / family / result blocks), an optional `finding` with a `befast` letter (or `null` for supporting data), and `unlocks` (child node ids). Point the engine at your case object at the top of `js/main.js`.

## Disclaimer

Educational game, not medical advice or clinical training. If you suspect a real stroke, call emergency services — **time is brain**.
