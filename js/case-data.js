/*
 * PatientMap case file.
 *
 * Each case is a directed graph of nodes. Node schema:
 *   id        unique string
 *   title     short label shown on the map
 *   icon      emoji shown inside the node once discovered
 *   type      'scene' | 'dialogue' | 'exam' | 'test'
 *   actionLabel  text shown on the locked node / button ("Ask about onset")
 *   content   array of blocks: { kind: 'narrate'|'patient'|'family'|'result', text }
 *   finding   optional: { id, label, detail, befast } — befast is one of
 *             'B','E','F','A','S','T' or null for supporting/contextual data.
 *             Any finding can be tagged to any BEFAST letter in-game; a tag
 *             only "counts" when finding.befast matches the chosen letter.
 *   unlocks   array of child node ids revealed after visiting this node
 *
 * alert criteria:
 *   requiredLetters  letters that MUST be correctly tagged (e.g. ['T'])
 *   minDeficits      minimum correctly-tagged deficits among B/E/F/A/S
 *   requiredNodes    node ids that must be discovered before activation
 *   prompts          case-specific pushback text shown when criteria are unmet
 *
 * To author additional cases, copy this shape and point the engine at your
 * case object at the top of js/main.js.
 */

const CASE_BEFAST_INFO = {
  B: { word: 'Balance', hint: 'Sudden loss of balance or coordination' },
  E: { word: 'Eyes', hint: 'Sudden vision change, field cut, or gaze deviation' },
  F: { word: 'Face', hint: 'Facial asymmetry / droop' },
  A: { word: 'Arms', hint: 'Unilateral arm weakness or drift' },
  S: { word: 'Speech', hint: 'Slurred speech, aphasia, or word-finding difficulty' },
  T: { word: 'Time', hint: 'Last known well time established' },
};

const CASE_001 = {
  id: 'case-001',
  title: 'The Vision That Wasn\'t There',
  rootId: 'intro',

  // Stroke Alert criteria
  alert: {
    requiredLetters: ['T'],          // last-known-well must be tagged
    minDeficits: 1,                  // at least one correct B/E/F/A/S (here: E)
    requiredNodes: ['vf_test'],      // objective field defect must be confirmed
    prompts: {
      T: 'You haven\'t established a <b>Time</b> / last-known-well. Ask the patient when he last felt completely normal.',
      deficits: 'No objective BEFAST deficit is correctly tagged yet. In this patient it\'s subtle — the deficit is in the <b>Eyes</b> (a right visual field cut). Tag at least <b>1</b>.',
      nodes: {
        vf_test: 'You haven\'t confirmed the deficit objectively at the bedside — perform <b>Confrontation Visual Field Testing</b>.',
      },
    },
  },

  debrief: {
    success: [
      'STROKE ALERT ACTIVATED — the stroke team is mobilizing and the patient is headed for emergent imaging (CT/CTA, then MRI).',
      'Mr. D, a 20-year-old college student, presented with a sudden right homonymous hemianopia and a mild headache. Covering either eye didn\'t change the deficit and it respects the vertical midline — localizing it behind the optic chiasm, to the LEFT occipital cortex / optic radiations.',
      'This is exactly the stroke a plain FAST screen misses: no facial droop, no arm weakness, no slurred speech. Only the "B" and "E" of BEFAST catch it — and here the "bumping into objects" was never a balance problem (gait and vestibular function were intact); it was the visual field loss itself.',
      'His youth is a trap. Stroke in young adults is uncommon but real — dissection, cardioembolism, hypercoagulable states, vasculitis, illicit drugs — and the family history of stroke is a clue. Dismissing this as a migraine, the tempting mimic, would have burned the treatment window.',
      'Last known well was the night before, an unclear/wake-up onset — which complicates IV thrombolysis but does NOT exclude thrombectomy or imaging-guided treatment. Time is brain: recognizing the deficit and calling the alert was the whole job.',
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
        { kind: 'narrate', text: 'A 20-year-old college student, Mr. D, sits slumped in the exam chair, rubbing at his eyes.' },
        { kind: 'narrate', text: '"Good morning, Mr. D. How are you today?"' },
        { kind: 'patient', text: '"Not so great, honestly."' },
        { kind: 'narrate', text: '"I\'m sorry to hear that. What\'s going on?"' },
        { kind: 'patient', text: '"This morning I woke up with an annoying headache. I went to class anyway, and during the lecture everything started looking… funny. It got real hard to see things."' },
        { kind: 'patient', text: '"After class I headed to my girlfriend\'s room but kept bumping into people on the way. She freaked out and made me come see you."' },
        { kind: 'narrate', text: 'Where would you like to begin?' },
      ],
      finding: {
        id: 'f_cc',
        label: 'Chief complaint: headache, vision change, and bumping into objects since this morning',
        detail: 'A young patient with the acute onset of a visual disturbance plus mild headache and trouble navigating. Collect the details and localize it.',
        befast: null,
      },
      unlocks: ['vision_topic', 'walking_topic', 'headache_topic', 'lkw_topic', 'general_topic', 'history_topic'],
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
        { kind: 'patient', text: '"Yeah… it\'s hard to see things on my right. Kinda like I\'ve got something in my eyes. I figured it was allergies, but rubbing them doesn\'t help."' },
        { kind: 'narrate', text: 'Drill into the character of the visual loss.' },
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
        { kind: 'patient', text: '"Things on my right just aren\'t there, or they\'re super blurry — like walking around with one eye closed."' },
        { kind: 'patient', text: '"When I was taking notes I couldn\'t see my right hand or the keys on the right side of the keyboard. I knocked my phone right off the table and never saw it — I\'d set it next to my laptop and totally forgot. Even when I heard it hit the floor, I didn\'t see it fall."' },
        { kind: 'result', text: 'He consistently misses objects in the right half of his world — the history of a right homonymous visual field defect, i.e. neglect of one side of space from a lesion in the opposite (left) hemisphere\'s visual pathway.' },
      ],
      finding: {
        id: 'f_right_field',
        label: 'Difficulty seeing objects on the right (missed phone and right side of keyboard)',
        detail: 'Consistently misses objects in the right hemifield — the classic history of a right homonymous hemianopia.',
        befast: 'E',
      },
      unlocks: ['vf_test'],
    },

    vf_test: {
      id: 'vf_test',
      title: 'Confrontation Visual Fields',
      icon: '🎯',
      type: 'exam',
      actionLabel: 'Test visual fields by confrontation',
      content: [
        { kind: 'narrate', text: 'You sit facing him, have him fixate on your nose, and bring wiggling fingers in from each quadrant — then repeat covering one eye at a time.' },
        { kind: 'result', text: 'Dense field loss to the RIGHT in both eyes, sharply respecting the vertical midline, identical whether the right or left eye is covered: a right homonymous hemianopia.' },
        { kind: 'narrate', text: 'This localizes to the left retrochiasmal visual pathway (optic radiation / occipital cortex) — the brain, not the eye.' },
      ],
      finding: {
        id: 'f_vf',
        label: 'Right homonymous hemianopia confirmed on confrontation testing',
        detail: 'Objective, reproducible right field cut respecting the vertical meridian in both eyes — a cortical/retrochiasmal visual deficit. The key objective finding for activation.',
        befast: 'E',
      },
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
        { kind: 'result', text: 'The deficit is present in both eyes and unchanged by covering either one — it is homonymous (the same side of the field in both eyes). That points behind the optic chiasm, to the brain, and away from a monocular eye/retina/optic-nerve cause.' },
      ],
      finding: {
        id: 'f_bilateral',
        label: 'Deficit in both eyes (homonymous); covering either eye does not change it',
        detail: 'A homonymous field loss localizes to the retrochiasmal pathway in the brain, ruling out a monocular (eye) cause.',
        befast: 'E',
      },
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
        { kind: 'patient', text: '"Nope — no flashes, no floaters. It doesn\'t move or drift. And it\'s not like a curtain… it\'s more like it just isn\'t there."' },
        { kind: 'result', text: 'No positive phenomena (against migrainous aura), no movement (against migraine\'s marching scintillations), and no curtain/altitudinal pattern (against a retinal/vascular eye event). A fixed, negative field loss fits a cortical stroke.' },
      ],
      finding: {
        id: 'f_characterize',
        label: 'No flashes, floaters, drifting, or curtain — vision simply "isn\'t there"',
        detail: 'Absence of positive phenomena and of a curtain/altitudinal pattern argues against migraine aura and primary retinal causes.',
        befast: null,
      },
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
        { kind: 'patient', text: '"Nope."' },
        { kind: 'result', text: 'Painless visual loss without injection makes acute glaucoma, optic neuritis, and other primary eye pathology unlikely.' },
      ],
      finding: {
        id: 'f_eyepain',
        label: 'No eye pain, redness, or pressure',
        detail: 'Painless, quiet eye argues against primary ocular causes (glaucoma, optic neuritis, etc.).',
        befast: null,
      },
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
        { kind: 'patient', text: '"It must\'ve been sudden — it\'d have been less surprising if it came on slowly, like turning down a light instead of flipping it off. I first noticed it during class, sometime between 10 and 11."' },
        { kind: 'result', text: 'An abrupt, "switch-flipped" onset is characteristic of a vascular (stroke) event rather than a gradually progressive process. Note: this is when it was NOTICED — last known well must be pinned down separately.' },
      ],
      finding: {
        id: 'f_sudden',
        label: 'Sudden ("switch-flipped") onset, first noticed in class ~10–11am',
        detail: 'Abrupt onset favors a vascular cause. This is the time of recognition, not necessarily the last-known-well.',
        befast: null,
      },
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
        { kind: 'patient', text: '"Walking down the hall I kept bumping into people — I didn\'t even see them until I looked right at them. Almost took out a trash can, too."' },
        { kind: 'patient', text: '"But no, I\'m not dizzy and the room\'s not spinning. My balance feels fine. I literally just can\'t see things on the right."' },
        { kind: 'result', text: 'Key distinction: the bumping is driven by the right visual field loss, NOT by ataxia or vertigo. Balance and vestibular function are intact — this is an Eyes finding, not a Balance finding.' },
      ],
      finding: {
        id: 'f_bumping',
        label: 'Bumping into objects on the right; no dizziness/vertigo, balance intact',
        detail: 'He collides with things he cannot see in his right field. Gait and balance are normal and there is no vertigo — the deficit is visual (E), not balance (B).',
        befast: 'E',
      },
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
      finding: {
        id: 'f_headache',
        label: 'Headache: low-grade throbbing, temples and forehead',
        detail: 'Mild headache can accompany posterior strokes but is nonspecific — supporting context, not a BEFAST letter.',
        befast: null,
      },
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
        { kind: 'patient', text: '"Woke up about 9:30 — my alarm, not the headache. No headache last night; I went to sleep around 3."' },
        { kind: 'result', text: 'Headache began around or after waking (~9:30) and was absent the night before — consistent with an acute event this morning.' },
      ],
      finding: {
        id: 'f_h_onset',
        label: 'Headache began around waking (~9:30am); none the night before',
        detail: 'Timeline detail supporting an acute process this morning.',
        befast: null,
      },
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
      finding: {
        id: 'f_severity',
        label: 'Headache severity 2/10 (non-thunderclap)',
        detail: 'Mild headache. Low severity does not exclude stroke and does not localize.',
        befast: null,
      },
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
        { kind: 'patient', text: '"Last night, before I went to sleep. And yeah — all of this started after I woke up this morning."' },
        { kind: 'result', text: 'Last known well: the night before, prior to sleep. Because he can\'t confirm normal vision between waking and the onset in class, the conservative last-known-well is set to last night — an unclear/"wake-up" onset that still warrants emergent imaging.' },
      ],
      finding: {
        id: 'f_lkw',
        label: 'Last known well: the night before, prior to sleep',
        detail: 'The single most important time point for treatment decisions. An unclear or wake-up onset does not exclude thrombectomy or imaging-guided therapy.',
        befast: 'T',
      },
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
        { kind: 'narrate', text: 'Ask about medications and allergies.' },
      ],
      unlocks: ['g_medication', 'g_allergies'],
    },

    g_medication: {
      id: 'g_medication',
      title: 'Medications',
      icon: '💊',
      type: 'dialogue',
      actionLabel: 'Ask about medications',
      content: [
        { kind: 'narrate', text: '"Are you currently on any medications?"' },
        { kind: 'patient', text: '"Nope."' },
        { kind: 'result', text: 'No anticoagulants or other agents on board — relevant to treatment eligibility.' },
      ],
      finding: {
        id: 'f_meds',
        label: 'No current medications',
        detail: 'No anticoagulants on board — removes a potential thrombolysis contraindication.',
        befast: null,
      },
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
        { kind: 'patient', text: '"Just isotretinoin. I took it once, maybe 4 or 5 years ago, and got a major headache — way worse than today. It went away on its own."' },
        { kind: 'result', text: 'A single remote reaction to isotretinoin (severe headache). Worth documenting for drug safety; not relevant to today\'s field cut.' },
      ],
      finding: {
        id: 'f_allergy',
        label: 'Reported allergy to isotretinoin (severe headache once, 4–5y ago)',
        detail: 'Documented for medication safety; not contributory to the current presentation.',
        befast: null,
      },
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
      finding: {
        id: 'f_history',
        label: 'No recent head trauma; no seizure history',
        detail: 'Reduces likelihood of traumatic or postictal causes for the deficit.',
        befast: null,
      },
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
        { kind: 'result', text: 'Recent oral intake noted — useful for procedural planning, and makes profound hypoglycemia less likely (though a glucose should still be checked).' },
      ],
      finding: {
        id: 'f_intake',
        label: 'Last oral intake: banana and tea this morning',
        detail: 'Relevant to procedural planning; recent intake makes hypoglycemia less likely but does not replace a glucose check.',
        befast: null,
      },
      unlocks: [],
    },
  },
};
