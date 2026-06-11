# PatientMap

A browser-based clinical reasoning game about acute stroke recognition, built around the **BEFAST** screen (Balance · Eyes · Face · Arms · Speech · Time).

**Play it:** https://walterfarrar.github.io/PatientMap/

## How it plays

You're at the bedside of a patient with a sudden change. Starting from a single node, you expand a live "mind map" of the encounter:

1. **Tap a node** to act — talk to the patient, perform a focused exam maneuver, or run a bedside test. The conversation opens right on the map, next to the patient.
2. Each action reveals **new nodes** branching off it, and the dialogue surfaces **highlighted key phrases**.
3. **Drag a highlighted phrase** into a BEFAST category in the *Patient History & Notes* chart on the right. Correct evidence locks in green; the wrong data — or the right data under the wrong letter — is marked **incorrect** (red) with feedback. Red-herring details belong in the **Distractors** trash. Tap any filed item to send it back.
4. When your documentation is strong enough, trigger the **STROKE ALERT**. Activate too early and the stroke team pushes back with specific feedback on what's missing — every node stays revisitable, so keep digging.

The bundled case ("The Vision That Wasn't There") is a young patient whose only deficit is a right homonymous hemianopia — the kind of posterior-circulation stroke a plain FAST screen misses. Watch for the trap: the patient "bumps into things," but his balance is intact — that's an **Eyes** finding, not **Balance**.

To accept an activation in this case you need:

- A correctly filed **Time** (last known well)
- At least **one** correctly filed BEFAST deficit (here, **Eyes**)
- No mis-filed evidence left standing
- The visual field defect confirmed objectively at the bedside

Dialogue and findings use realistic clinical language, aimed at nursing, EMS, and medical learners.

## Tech

Plain HTML/CSS/JavaScript — no build step, no dependencies. The node map is rendered as SVG with pan/zoom; drag-and-drop is pointer-based so it works with mouse and touch.

- `js/case-data.js` — the case file: a declarative graph of nodes, draggable evidence chips, and stroke-alert criteria. Cases are data, not code; see the schema comment at the top of the file to author new ones.
- `js/main.js` — the engine: tree layout, SVG rendering, discovery state, the conversation overlay, drag-and-drop, and alert evaluation.
- `css/style.css` — dark medical-monitor theme.
- `assets/patient.png` — the patient portrait.
- `tools/extract_character.py` — one-off script that cut the portrait out of a reference screenshot.

### Run locally

Open `index.html` in a browser. That's it.

## Adding cases

Copy the shape of `CASE_001` in `js/case-data.js`. Each node declares its `actionLabel` (what the locked node offers), `content` (narration / patient / family / result blocks), `unlocks` (child node ids), and `chips`: the draggable phrases. Each chip's `text` must appear verbatim in one of the node's content blocks; its `befast` is a letter (`B/E/F/A/S/T`) for real evidence or `null` for a distractor that belongs in the trash. Point the engine at your case object at the top of `js/main.js`.

## Disclaimer

Educational game, not medical advice or clinical training. If you suspect a real stroke, call emergency services — **time is brain**.
