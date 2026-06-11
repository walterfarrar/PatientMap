/*
 * PatientMap case file.
 *
 * Each case is a directed graph of nodes. Node schema:
 *   id        unique string
 *   title     short label shown on the map
 *   icon      emoji shown inside the node once discovered
 *   type      'scene' | 'dialogue' | 'exam' | 'test'  (drives time cost)
 *   phase     optional; 2 = node only becomes available after the Stroke Alert
 *   actionLabel  text shown on the locked node / button ("Ask about onset")
 *   content   array of blocks: { kind: 'narrate'|'patient'|'family'|'result', text }
 *   chips     array of draggable evidence phrases:
 *               { text, befast, sbar, decisive, required, gap, note }
 *             - `text` MUST appear verbatim inside one of this node's
 *               patient/family/result content blocks; it gets highlighted
 *               and becomes draggable. (narrate blocks are never chip hosts)
 *             - `befast`  'B'|'E'|'F'|'A'|'S'|'T' for a real deficit, or null
 *               (its phase-1 home is the Clinical Notes pile).
 *             - `sbar`    'S'|'B'|'A'|'R' = where it belongs in the phase-2
 *               SBAR handoff, or null (stays in Clinical Notes).
 *             - `decisive` true = this single finding justifies activation
 *               on its own (with Time) — the "sure-fire" sign.
 *             - `required` true = the handoff is not accepted without it.
 *             - `gap`     what the receiving nurse asks if it's missing.
 *             - `note`    feedback shown in toasts once placed.
 *   unlocks   array of child node ids revealed after visiting this node
 *
 * alert criteria (phase 1):
 *   requiredLetters  letters that must have correctly-placed evidence
 *   minDeficits      minimum correctly-placed deficits among B/E/F/A/S
 *                    (the accumulation path; a correctly-placed `decisive`
 *                    chip bypasses it)
 *   requiredNodes    node ids that must be discovered for the accumulation path
 *   prompts          case-specific pushback text shown when criteria are unmet
 *
 * scoring:
 *   alertSteps    [threeStarMax, twoStarMax] — steps taken at accepted alert
 *   handoffSteps  [threeStarMax, twoStarMax] — steps from alert to accepted handoff
 */

const CASE_BEFAST_INFO = {
  B: { word: 'Balance', hint: 'Sudden loss of balance or coordination' },
  E: { word: 'Eyes', hint: 'Sudden vision change, field cut, or gaze deviation' },
  F: { word: 'Face', hint: 'Facial asymmetry / droop' },
  A: { word: 'Arms', hint: 'Unilateral arm weakness or drift' },
  S: { word: 'Speech', hint: 'Slurred speech, aphasia, or word-finding difficulty' },
  T: { word: 'Time', hint: 'Time to call 911 — this is the trigger to activate, not a data field' },
};

const CASE_SBAR_INFO = {
  S: { word: 'Situation', hint: 'Who the patient is, what happened, and when' },
  B: { word: 'Background', hint: 'History, meds, allergies, last intake' },
  A: { word: 'Assessment', hint: 'Objective findings: exam, vitals, glucose, your read' },
  R: { word: 'Recommendation', hint: 'What needs to happen next' },
};

const CASE_001 = {
  id: 'case-001',
  title: 'The Vision That Wasn\'t There',
  rootId: 'intro',

  patient: {
    name: 'Mateo D.',
    dob: '10/12/02',
    portrait: 'assets/patient.png',
  },

  // Stroke Alert criteria (phase 1).  "T" is the trigger to activate (the
  // STROKE ALERT button itself), not a data slot — so no last-known-well is
  // required to call. You call on the deficit; LKW is handoff data.
  alert: {
    requiredLetters: [],
    minDeficits: 1,
    requiredNodes: ['vf_test'],
    prompts: {
      deficits: 'No objective BEFAST deficit is correctly filed yet. In this patient it\'s subtle — the deficit is in the <b>Eyes</b> (a right visual field cut).',
      nodes: {
        vf_test: 'You haven\'t confirmed the deficit objectively at the bedside — perform <b>Confrontation Visual Field Testing</b>.',
      },
    },
  },

  scoring: {
    alertSteps: [5, 8],       // optimal decisive beeline ≈ 4 steps
    handoffSteps: [10, 15],   // optimal collection sweep ≈ 9 steps
  },

  debrief: {
    success: [
      'Mateo D., a 20-year-old college student, presented with a sudden right homonymous hemianopia and a mild headache. Covering either eye didn\'t change the deficit and it respects the vertical midline — localizing it behind the optic chiasm, to the LEFT occipital cortex / optic radiations.',
      'This is exactly the stroke a plain FAST screen misses: no facial droop, no arm weakness, no slurred speech. Only the "B" and "E" of BEFAST catch it — and here the "bumping into people" was never a balance problem (gait and vestibular function were intact); it was the visual field loss itself.',
      'A confirmed homonymous hemianopia is a decisive sign — that single finding justifies activation. The "T" in BEFAST is the call to action: time to activate, not another box of data to fill. You don\'t need to finish the interview before calling — time is brain.',
      'But the alert isn\'t the end of the job. The team that takes him needs vitals, glucose (his skipped breakfast made hypoglycemia a real mimic), meds, allergies, and last oral intake — the SBAR is what makes your fast recognition usable downstream.',
      'Last known well was the night before, an unclear/wake-up onset — which complicates IV thrombolysis but does NOT exclude thrombectomy or imaging-guided treatment.',
    ],
  },

  nodes: {
    intro: {
      id: 'intro',
      title: 'Greet the Patient',
      icon: '👋',
      type: 'scene',
      actionLabel: 'Greet the patient',
      content: [
        { kind: 'narrate', text: 'A 20-year-old college student, Mateo, sits slumped in the exam chair, rubbing at his eyes.' },
        { kind: 'narrate', text: '"Good morning. How are you today?"' },
        { kind: 'patient', text: '"Not so great, honestly."' },
        { kind: 'narrate', text: '"I\'m sorry to hear that. What\'s going on?"' },
        { kind: 'patient', text: '"This morning I woke up with an annoying headache. I went to class anyway, and during the lecture everything started looking funny. It got real hard to see things."' },
        { kind: 'patient', text: '"After class I headed to my girlfriend\'s room but kept bumping into people on the way. She freaked out and made me come see you."' },
        { kind: 'narrate', text: 'Highlighted phrases can be dragged into the chart. Where would you like to begin?' },
      ],
      chips: [
        { text: 'hard to see things', befast: 'E', sbar: 'S', note: 'A vision complaint — the heart of this case.' },
        { text: 'annoying headache', befast: null, sbar: 'S', note: 'Not a BEFAST deficit — but it IS part of the presenting situation at handoff.' },
      ],
      unlocks: ['vision_topic', 'walking_topic', 'headache_topic', 'lkw_topic', 'general_topic', 'history_topic', 'plan_node'],
    },

    /* ------------------------------- VISION -------------------------------- */

    vision_topic: {
      id: 'vision_topic',
      title: 'The Eyes / Vision',
      icon: '👁️',
      type: 'dialogue',
      actionLabel: 'Talk about his vision',
      content: [
        { kind: 'narrate', text: '"Let\'s talk about your eyes and your vision."' },
        { kind: 'patient', text: '"Yeah, it\'s hard to see things on my right. Kinda like I\'ve got something in my eyes. I figured it was allergies, but rubbing them doesn\'t help."' },
        { kind: 'narrate', text: 'Drill into the character of the visual loss.' },
      ],
      chips: [
        { text: 'hard to see things on my right', befast: 'E', sbar: 'S', note: 'Lateralized visual loss — Eyes.' },
        { text: 'allergies', befast: null, sbar: null, note: 'The patient\'s own guess, and a red herring in both phases. Clinical Notes.' },
      ],
      unlocks: ['v_describe', 'v_oneboth', 'v_characterize', 'v_painred', 'onset_topic'],
    },

    v_describe: {
      id: 'v_describe',
      title: 'Describe the Vision Loss',
      icon: '🔍',
      type: 'dialogue',
      actionLabel: 'Ask him to describe it',
      content: [
        { kind: 'narrate', text: '"Can you explain what you mean by it being hard to see things on your right?"' },
        { kind: 'patient', text: '"Things on my right just aren\'t there, or they\'re super blurry, like walking around with one eye closed."' },
        { kind: 'patient', text: '"When I was taking notes I couldn\'t see my right hand or the keys on the right side of the keyboard. I knocked my phone right off the table and never even saw it fall."' },
        { kind: 'result', text: 'He consistently misses objects in the right half of his world — the history of a right homonymous visual field defect, i.e. loss of one side of space from a lesion in the opposite (left) hemisphere\'s visual pathway.' },
      ],
      chips: [
        { text: 'keys on the right side of the keyboard', befast: 'E', sbar: 'S', note: 'Missing the right half of space — a right field cut.' },
      ],
      unlocks: ['vf_test'],
    },

    vf_test: {
      id: 'vf_test',
      title: 'Confrontation Visual Fields',
      icon: '🎯',
      type: 'exam',
      actionLabel: 'Test visual fields by confrontation',
      content: [
        { kind: 'narrate', text: 'You sit facing him, have him fixate on your nose, and bring wiggling fingers in from each quadrant, then repeat covering one eye at a time.' },
        { kind: 'result', text: 'Dense field loss to the RIGHT in both eyes, sharply respecting the vertical midline, identical whether the right or left eye is covered: a right homonymous hemianopia.' },
        { kind: 'narrate', text: 'This localizes to the left retrochiasmal visual pathway (optic radiation / occipital cortex) — the brain, not the eye. A decisive sign: with a last-known-well, this alone justifies activation.' },
      ],
      chips: [
        {
          text: 'right homonymous hemianopia', befast: 'E', sbar: 'A',
          decisive: true, required: true,
          gap: 'What exactly did your exam find? They need the objective deficit, not just "vision trouble."',
          note: 'The objective, reproducible field cut — a decisive sign that justifies activation on its own.',
        },
      ],
      unlocks: [],
    },

    v_oneboth: {
      id: 'v_oneboth',
      title: 'One Eye or Both?',
      icon: '👀',
      type: 'exam',
      actionLabel: 'Cover one eye — does it change?',
      content: [
        { kind: 'narrate', text: '"What happens if you cover one eye? Does the problem go away?"' },
        { kind: 'patient', text: '"No. My vision\'s still messed up no matter which eye is covered."' },
        { kind: 'result', text: 'The deficit is present in both eyes and unchanged by covering either one — it is homonymous (the same side of the field in both eyes), pointing behind the optic chiasm, to the brain, and away from a monocular eye cause.' },
      ],
      chips: [
        { text: 'no matter which eye is covered', befast: 'E', sbar: 'A', note: 'Homonymous (both eyes) field loss localizes to the brain.' },
      ],
      unlocks: [],
    },

    v_characterize: {
      id: 'v_characterize',
      title: 'Character of the Loss',
      icon: '🌫️',
      type: 'dialogue',
      actionLabel: 'Flashes, drifting, or a curtain?',
      content: [
        { kind: 'narrate', text: '"Do you see any flashes of light or new floaters? Does the missing vision move or drift? Does it feel like a curtain or shadow is coming across?"' },
        { kind: 'patient', text: '"Nope, no flashes, no floaters. It doesn\'t move or drift. And it\'s not like a curtain, it\'s more like it just isn\'t there."' },
        { kind: 'result', text: 'No positive phenomena (against migrainous aura), no movement (against migraine\'s marching scintillations), and no curtain/altitudinal pattern (against a retinal/vascular eye event). A fixed, negative field loss fits a cortical stroke.' },
      ],
      chips: [
        { text: 'no flashes, no floaters', befast: null, sbar: 'A', note: 'A pertinent negative that argues against migraine — assessment material, not a deficit.' },
      ],
      unlocks: [],
    },

    v_painred: {
      id: 'v_painred',
      title: 'Pain or Redness?',
      icon: '😣',
      type: 'dialogue',
      actionLabel: 'Ask about eye pain / redness',
      content: [
        { kind: 'narrate', text: '"Any pain, redness, or pressure in or around the eye?"' },
        { kind: 'patient', text: '"Nope. None of that."' },
        { kind: 'result', text: 'Painless visual loss without injection makes acute glaucoma, optic neuritis, and other primary eye pathology unlikely.' },
      ],
      chips: [
        { text: 'None of that', befast: null, sbar: null, note: 'Helps you exclude eye pathology at the bedside, but adds nothing to the handoff. Clinical Notes.' },
      ],
      unlocks: [],
    },

    onset_topic: {
      id: 'onset_topic',
      title: 'Onset of Vision Loss',
      icon: '⚡',
      type: 'dialogue',
      actionLabel: 'Ask when/how it started',
      content: [
        { kind: 'narrate', text: '"Was your vision loss sudden or gradual? When did you first notice it?"' },
        { kind: 'patient', text: '"It must\'ve been sudden. I first noticed it during class, sometime between 10 and 11."' },
        { kind: 'result', text: 'An abrupt, "switch-flipped" onset is characteristic of a vascular (stroke) event. Note: this is when it was NOTICED — last known well must be pinned down separately.' },
      ],
      chips: [
        { text: 'between 10 and 11', befast: null, sbar: 'S', note: 'Not the last-known-well — but when symptoms were noticed IS part of the situation at handoff.' },
      ],
      unlocks: [],
    },

    /* ------------------------------ BALANCE/GAIT --------------------------- */

    walking_topic: {
      id: 'walking_topic',
      title: 'Bumping Into Things',
      icon: '🚶',
      type: 'dialogue',
      actionLabel: 'Ask about bumping / balance',
      content: [
        { kind: 'narrate', text: '"Let\'s talk about bumping into things. Are you dizzy, or does it feel like the room is spinning? How\'s your balance?"' },
        { kind: 'patient', text: '"Walking down the hall I kept bumping into people. I didn\'t even see them until I looked right at them."' },
        { kind: 'patient', text: '"But no, I\'m not dizzy and the room\'s not spinning. My balance feels fine. I literally just can\'t see things on the right."' },
        { kind: 'result', text: 'Key distinction: the bumping is driven by the right visual field loss, NOT by ataxia or vertigo. Balance and vestibular function are intact — this is an Eyes finding, not a Balance finding.' },
      ],
      chips: [
        { text: 'bumping into people', befast: 'E', sbar: 'S', note: 'A trap! It looks like Balance, but he bumps into things he cannot SEE on the right. This is Eyes, not Balance.' },
        { text: 'balance feels fine', befast: null, sbar: null, note: 'Normal balance actively argues AGAINST a "B" deficit. Clinical Notes.' },
      ],
      unlocks: [],
    },

    /* ------------------------------- HEADACHE ------------------------------ */

    headache_topic: {
      id: 'headache_topic',
      title: 'The Headache',
      icon: '🤕',
      type: 'dialogue',
      actionLabel: 'Ask about the headache',
      content: [
        { kind: 'narrate', text: '"Tell me about your headache — can you describe the pain and where it is?"' },
        { kind: 'patient', text: '"Kind of a low, throbbing ache. Mostly around my temples, maybe into my forehead."' },
        { kind: 'result', text: 'A mild bilateral throbbing headache. Headache can accompany posterior-circulation strokes but is nonspecific; it is not itself a BEFAST deficit.' },
      ],
      chips: [
        { text: 'throbbing ache', befast: null, sbar: 'S', note: 'Nonspecific for BEFAST, but part of the presenting picture for handoff.' },
      ],
      unlocks: ['h_onset', 'h_severity'],
    },

    h_onset: {
      id: 'h_onset',
      title: 'Headache Timing',
      icon: '🕒',
      type: 'dialogue',
      actionLabel: 'When did the headache start?',
      content: [
        { kind: 'narrate', text: '"What time did you wake up? Did the headache wake you, and did you have it last night?"' },
        { kind: 'patient', text: '"Woke up about 9:30, my alarm, not the headache. No headache last night; I went to sleep around 3."' },
        { kind: 'result', text: 'Headache began around or after waking and was absent the night before — consistent with an acute event this morning.' },
      ],
      chips: [
        { text: 'Woke up about 9:30', befast: null, sbar: 'S', note: 'A time, but the time he WOKE — not the last-known-well. Still timeline data for the handoff.' },
      ],
      unlocks: [],
    },

    h_severity: {
      id: 'h_severity',
      title: 'Headache Severity',
      icon: '📊',
      type: 'dialogue',
      actionLabel: 'Rate the pain 0–10',
      content: [
        { kind: 'narrate', text: '"On a scale of 0 to 10, how severe is the pain?"' },
        { kind: 'patient', text: '"Probably a 2. It\'s there, just enough to make me feel kinda gross."' },
        { kind: 'result', text: 'A low-severity, non-thunderclap headache — less concerning for subarachnoid hemorrhage, though imaging remains essential. Low severity does not exclude stroke.' },
      ],
      chips: [
        { text: 'Probably a 2', befast: null, sbar: 'S', note: 'Pain score — supporting situation detail at handoff.' },
      ],
      unlocks: [],
    },

    /* ----------------------------- TIME / LKW ------------------------------ */

    lkw_topic: {
      id: 'lkw_topic',
      title: 'Last Known Well',
      icon: '🕗',
      type: 'dialogue',
      actionLabel: 'Establish last known well',
      content: [
        { kind: 'narrate', text: '"When did you last feel completely normal? Everything you\'ve described has happened since you woke up?"' },
        { kind: 'patient', text: '"Last night before I went to sleep. And yeah, all of this started after I woke up this morning."' },
        { kind: 'result', text: 'Last known well: the night before, prior to sleep. Because he can\'t confirm normal vision between waking and the onset in class, the conservative last-known-well is set to last night — an unclear/"wake-up" onset that still warrants emergent imaging.' },
      ],
      chips: [
        {
          text: 'Last night before I went to sleep', befast: null, sbar: 'S',
          required: true,
          gap: 'When was he last known well? The whole treatment window hangs on it.',
          note: 'The last-known-well — not a deficit you tag, but the single most important time point for the handoff.',
        },
      ],
      unlocks: [],
    },

    /* ------------------------------- GENERAL ------------------------------- */

    general_topic: {
      id: 'general_topic',
      title: 'General Background',
      icon: '📋',
      type: 'dialogue',
      actionLabel: 'Cover general background',
      content: [
        { kind: 'narrate', text: '"Let\'s cover some general background."' },
        { kind: 'narrate', text: 'Ask about medications and allergies, and get a set of vitals.' },
      ],
      chips: [],
      unlocks: ['g_medication', 'g_allergies', 'obtain_vitals'],
    },

    g_medication: {
      id: 'g_medication',
      title: 'Medications',
      icon: '💊',
      type: 'dialogue',
      actionLabel: 'Ask about medications',
      content: [
        { kind: 'narrate', text: '"Are you currently on any medications?"' },
        { kind: 'patient', text: '"No medications, none at all."' },
        { kind: 'result', text: 'No anticoagulants or other agents on board — directly relevant to thrombolysis eligibility.' },
      ],
      chips: [
        {
          text: 'No medications', befast: null, sbar: 'B',
          required: true,
          gap: 'Is he on any medications — anticoagulants especially? It changes thrombolysis eligibility.',
          note: 'Treatment-critical background, not a BEFAST deficit.',
        },
      ],
      unlocks: [],
    },

    g_allergies: {
      id: 'g_allergies',
      title: 'Allergies',
      icon: '⚠️',
      type: 'dialogue',
      actionLabel: 'Ask about allergies',
      content: [
        { kind: 'narrate', text: '"Any allergies — food, medicine, anything? When did you last take it, and what happened?"' },
        { kind: 'patient', text: '"Just isotretinoin. I took it once, maybe 4 or 5 years ago, and got a major headache. It went away on its own."' },
        { kind: 'result', text: 'A single remote reaction to isotretinoin. Worth documenting for drug safety; not relevant to today\'s field cut.' },
      ],
      chips: [
        {
          text: 'isotretinoin', befast: null, sbar: 'B',
          required: true,
          gap: 'Any allergies? They\'re about to give this man drugs and contrast.',
          note: 'Drug-safety background for the handoff.',
        },
      ],
      unlocks: [],
    },

    obtain_vitals: {
      id: 'obtain_vitals',
      title: 'Vital Signs',
      icon: '🩺',
      type: 'test',
      actionLabel: 'Obtain a full set of vitals',
      content: [
        { kind: 'narrate', text: 'You cycle the monitor and run a full set of vitals.' },
        { kind: 'result', text: 'BP 128/82, HR 74 and regular, RR 14, SpO2 99% on room air, T 37.0 °C. Hemodynamically stable; the regular rhythm makes atrial fibrillation less likely on this strip.' },
      ],
      chips: [
        {
          text: 'BP 128/82, HR 74', befast: null, sbar: 'A',
          required: true,
          gap: 'What are his vitals? Nobody accepts a stroke handoff without them.',
          note: 'Stable vitals — core objective data for the handoff.',
        },
      ],
      unlocks: ['glucose_test'],
    },

    glucose_test: {
      id: 'glucose_test',
      title: 'POC Glucose',
      icon: '🩸',
      type: 'test',
      actionLabel: 'Check a point-of-care glucose',
      content: [
        { kind: 'narrate', text: 'A quick fingerstick — he mentioned skipping breakfast, and hypoglycemia is the classic stroke mimic.' },
        { kind: 'result', text: 'Point-of-care glucose: 96 mg/dL. Hypoglycemia is excluded as the cause of the deficit.' },
      ],
      chips: [
        {
          text: 'glucose: 96 mg/dL', befast: null, sbar: 'A',
          required: true,
          gap: 'Did you rule out hypoglycemia? They\'ll want the glucose before anything else.',
          note: 'Mimic excluded — essential assessment data.',
        },
      ],
      unlocks: [],
    },

    /* ------------------------------- HISTORY ------------------------------- */

    history_topic: {
      id: 'history_topic',
      title: 'Trauma & Seizure History',
      icon: '📜',
      type: 'dialogue',
      actionLabel: 'Ask about trauma / seizures',
      content: [
        { kind: 'narrate', text: '"Any recent head trauma? Have you ever had a seizure?"' },
        { kind: 'patient', text: '"No trauma. And nope, never had a seizure."' },
        { kind: 'result', text: 'No trauma and no seizure history makes a post-traumatic or postictal (Todd\'s phenomenon) explanation for the deficit unlikely.' },
      ],
      chips: [
        { text: 'never had a seizure', befast: null, sbar: 'B', note: 'Excludes a postictal mimic — background for the handoff.' },
      ],
      unlocks: ['h_intake'],
    },

    h_intake: {
      id: 'h_intake',
      title: 'Last Oral Intake',
      icon: '🍌',
      type: 'dialogue',
      actionLabel: 'Ask when he last ate/drank',
      content: [
        { kind: 'narrate', text: '"When did you last have something to eat or drink?"' },
        { kind: 'patient', text: '"Had a banana on the way to class, and some tea earlier."' },
        { kind: 'result', text: 'Recent oral intake noted — needed for procedural and airway planning downstream.' },
      ],
      chips: [
        {
          text: 'banana', befast: null, sbar: 'B',
          required: true,
          gap: 'When did he last eat or drink? Procedures and swallow screening depend on it.',
          note: 'Last oral intake — procedural planning data.',
        },
      ],
      unlocks: [],
    },

    /* --------------------------- PHASE 2: THE PLAN ------------------------- */

    plan_node: {
      id: 'plan_node',
      title: 'Formulate the Plan',
      icon: '📞',
      type: 'scene',
      phase: 2,
      actionLabel: 'Formulate your recommendation',
      content: [
        { kind: 'narrate', text: 'The stroke team is mobilizing. Before you pick up the phone, you set the plan in your head.' },
        { kind: 'result', text: 'Recommendation: emergent CT and CTA on arrival, then MRI as indicated. Until imaging and a swallow screen: keep him NPO, frequent neuro checks.' },
      ],
      chips: [
        {
          text: 'emergent CT and CTA', befast: null, sbar: 'R',
          required: true,
          gap: 'What do you actually want done next? A handoff without a recommendation isn\'t a handoff.',
          note: 'The core recommendation — emergent vascular imaging.',
        },
        { text: 'keep him NPO', befast: null, sbar: 'R', note: 'Good catch — aspiration safety until a swallow screen.' },
      ],
      unlocks: [],
    },
  },
};
