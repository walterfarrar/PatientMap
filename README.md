# PatientMap

A browser-based clinical reasoning game about acute stroke recognition, built around the **BEFAST** screen (Balance · Eyes · Face · Arms · Speech · Time).

**Play it:** https://walterfarrar.github.io/PatientMap/

## How it plays

You're at the bedside of a patient with a sudden change. Starting from a single node, you expand a live "mind map" of the encounter — and a **step counter** (top right) tracks how many actions you take. The game has two scored phases.

In BEFAST, the **T** is *Time to call 911* — the trigger to act, not a box of data to fill. So the **STROKE ALERT** button literally occupies the "T" slot of the chart; you call on the deficit, and last-known-well becomes handoff data rather than something gating the alert.

### Phase 1 — Recognition (BEFAST)

1. **Tap a node** to act — talk to the patient, perform a focused exam maneuver, or run a bedside test. The conversation opens right on the map, next to the patient. Each action is one step.
2. Each action reveals **new nodes** branching off it, and the dialogue surfaces **highlighted key phrases**.
3. **Drag a highlighted phrase** into a BEFAST category (B/E/F/A/S) in the chart on the right. Correct evidence locks in green; the wrong data — or the right data under the wrong letter — is marked **incorrect** (red) with feedback. Context that isn't a deficit belongs in **Clinical Notes**. Tap any filed item to send it back.
4. Hit **STROKE ALERT** (the T slot) as soon as your evidence justifies it. Two routes get you there: pile up enough ordinary BEFAST deficits, **or** correctly file a single **decisive sign** (a sure-fire stroke finding — here, the confirmed visual field cut). A premature activation costs a **2-step penalty**. Your star rating is how few steps it took to reach an accepted alert — speed matters.

### Phase 2 — The SBAR handoff

The alert isn't the end of the job. The chart flips to **S / B / A / R** (Situation · Background · Assessment · Recommendation) and the neurologist expects a clean handoff:

- Everything you collected — including the "Clinical Notes" items that weren't BEFAST deficits, like the last-known-well — appears in a pool to drag into the SBAR. Headache details, wake time, meds, allergies: they were never garbage, they're handoff data.
- Anything you never collected (vitals, glucose, last intake…) is still out on the map — and the step counter keeps running.
- Press **GIVE SBAR** when ready. Missing essentials get you interrupted ("What are his vitals?") and a 1-step penalty. Phase 2 stars rate the steps from alert to handoff.

The tension is the lesson: **recognize fast, then be thorough** — in that order.

The bundled case ("The Vision That Wasn't There") is a young patient whose only deficit is a right homonymous hemianopia — the kind of posterior-circulation stroke a plain FAST screen misses. Watch for the trap: the patient "bumps into things," but his balance is intact — that's an **Eyes** finding, not **Balance**.

To accept an activation in this case you need:

- Either the **decisive sign** (confirmed right homonymous hemianopia) correctly filed, or at least one ordinary deficit plus objective bedside confirmation
- No mis-filed evidence left standing

For full handoff marks, you also need vitals, a point-of-care glucose, meds, allergies, last oral intake, and a recommendation (emergent CT/CTA) filed under the right SBAR headings.

Dialogue and findings use realistic clinical language, aimed at nursing, EMS, and medical learners.

## Tech

Plain HTML/CSS/JavaScript — no build step, no dependencies. The node map is rendered as SVG with pan/zoom; drag-and-drop is pointer-based so it works with mouse and touch.

- `js/case-data.js` — the case file: a declarative graph of nodes, draggable evidence chips (with BEFAST + SBAR homes, decisive/required flags), alert criteria, and star thresholds. Cases are data, not code; see the schema comment at the top of the file to author new ones.
- `js/main.js` — the engine: tree layout, SVG rendering, discovery state, the step counter, the conversation overlay, drag-and-drop, two-phase evaluation, and the scorecard.
- `css/style.css` — dark medical-monitor theme.
- `assets/patient.png` — the patient portrait.
- `tools/extract_character.py` — one-off script that cut the portrait out of a reference screenshot.

### Run locally

Open `index.html` in a browser. That's it.

## Adding cases

Copy the shape of `CASE_001` in `js/case-data.js`. Each node declares its `actionLabel` (what the locked node offers), `content` (narration / patient / family / result blocks), `unlocks` (child node ids), and `chips`: the draggable phrases. Each chip's `text` must appear verbatim in one of the node's patient/family/result blocks; `befast` is its phase-1 home (`B/E/F/A/S` or `null` for Clinical Notes — note `T` is the action, not a drop zone), `sbar` its phase-2 home (`S/B/A/R` or `null`), `decisive: true` marks a sure-fire stroke sign, and `required: true` + `gap` define what the handoff demands. Nodes with `phase: 2` only appear after the alert. Tune `scoring.alertSteps` / `scoring.handoffSteps` to your case's optimal path. Point the engine at your case object at the top of `js/main.js`.

## Disclaimer

Educational game, not medical advice or clinical training. If you suspect a real stroke, call emergency services — **time is brain**.
