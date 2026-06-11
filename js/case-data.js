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
 *             'B','E','F','A','S','T' or null for supporting/contextual data
 *   unlocks   array of child node ids revealed after visiting this node
 *
 * To author additional cases, copy this shape and swap the case object
 * passed to PatientMapEngine.init() in main.js.
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
  title: 'Sudden Onset Speech Change',
  rootId: 'approach',

  // Stroke Alert criteria
  alert: {
    requiredLetters: ['T'],          // must be tagged
    minDeficits: 2,                  // of B/E/F/A/S
    requiredNodes: ['glucose_check'],// must be discovered (mimic rule-out)
  },

  debrief: {
    success: [
      'STROKE ALERT ACTIVATED — the stroke team is en route to CT.',
      'Eleanor Vance, 68F. Last known well 08:15 — within the thrombolytic window. Your exam documented left facial droop, left arm drift, dysarthria, gaze preference, and truncal ataxia: a right MCA-territory syndrome.',
      'Point-of-care glucose of 104 mg/dL excluded hypoglycemia, the most common stroke mimic. Untreated atrial fibrillation (anticoagulation self-discontinued) is the likely embolic source.',
      'Time is brain: roughly 1.9 million neurons are lost each minute a large-vessel occlusion goes untreated. Early, well-documented BEFAST evidence is exactly what gets the patient to CT — and to treatment — faster.',
    ],
  },

  nodes: {
    approach: {
      id: 'approach',
      title: 'Approach Patient',
      icon: '🚪',
      type: 'scene',
      actionLabel: 'Enter the room',
      content: [
        { kind: 'narrate', text: 'ED Bay 4, 09:02. Eleanor Vance, 68-year-old female, brought in by her husband. Triage note reads only: "talking funny since breakfast."' },
        { kind: 'narrate', text: 'She is awake on the stretcher, leaning slightly to her left. Her eyes seem drawn to the right side of the room. Her husband stands at the bedside, visibly anxious.' },
        { kind: 'narrate', text: 'Where do you begin?' },
      ],
      unlocks: ['talk_patient', 'talk_husband', 'primary_survey'],
    },

    /* ------------------------------- DIALOGUE ------------------------------ */

    talk_patient: {
      id: 'talk_patient',
      title: 'Talk to Patient',
      icon: '🗣️',
      type: 'dialogue',
      actionLabel: 'Ask Eleanor what happened',
      content: [
        { kind: 'narrate', text: '"Mrs. Vance, can you tell me what\'s going on today?"' },
        { kind: 'patient', text: '"I... feel... fffunny. My words... won\'t..." Her speech is effortful, slurred, and trails off. She looks frustrated.' },
        { kind: 'result', text: 'Spontaneous speech is dysarthric — slurred and poorly articulated, but she is attempting appropriate words.' },
      ],
      finding: {
        id: 'f_dysarthria_spont',
        label: 'Dysarthria in spontaneous speech',
        detail: 'Slurred, effortful speech noted during history-taking. Word choice appears appropriate (dysarthria rather than fluent aphasia).',
        befast: 'S',
      },
      unlocks: ['orientation_check', 'speech_exam'],
    },

    orientation_check: {
      id: 'orientation_check',
      title: 'Orientation & Commands',
      icon: '🧠',
      type: 'dialogue',
      actionLabel: 'Assess orientation (LOC questions)',
      content: [
        { kind: 'narrate', text: 'You ask her name, the current month, and ask her to open and close her eyes, then grip and release with her right hand.' },
        { kind: 'patient', text: '"Ell...eanor. June." Both commands are followed correctly, if slowly.' },
        { kind: 'result', text: 'NIHSS 1b/1c: oriented ×2, follows both commands. She is not confused — this is not delirium or a postictal state. Whatever is wrong is focal, not global.' },
      ],
      finding: {
        id: 'f_oriented',
        label: 'Alert and oriented, follows commands',
        detail: 'Intact comprehension and orientation argue against delirium, intoxication, or postictal confusion as the cause of her speech change.',
        befast: null,
      },
      unlocks: [],
    },

    talk_husband: {
      id: 'talk_husband',
      title: 'Talk to Husband',
      icon: '💬',
      type: 'dialogue',
      actionLabel: 'Interview the husband',
      content: [
        { kind: 'family', text: '"Doctor — she just isn\'t right. One minute we\'re eating breakfast, the next she\'s..." He gestures helplessly. "Ask me anything."' },
        { kind: 'narrate', text: 'He is a good historian. What do you want to know?' },
      ],
      unlocks: ['ask_onset', 'ask_history', 'ask_meds'],
    },

    ask_onset: {
      id: 'ask_onset',
      title: 'Establish Onset',
      icon: '🕒',
      type: 'dialogue',
      actionLabel: 'Ask exactly when she was last normal',
      content: [
        { kind: 'narrate', text: '"I need the exact time. When did you last see her completely normal?"' },
        { kind: 'family', text: '"Breakfast. She was telling me about the garden, totally herself. Then — it was 8:15, I\'d just looked at the kitchen clock — she dropped her fork and her words turned to mush. It was like a switch flipped."' },
        { kind: 'result', text: 'Last known well: 08:15, witnessed, with sudden onset. It is now 09:02 — 47 minutes in. She is well within any treatment window if this is a stroke.' },
      ],
      finding: {
        id: 'f_lkw',
        label: 'Last known well 08:15 (witnessed sudden onset)',
        detail: 'Abrupt, witnessed onset 47 minutes ago. A precise LKW time is the single most important data point for thrombolysis and thrombectomy eligibility.',
        befast: 'T',
      },
      unlocks: [],
    },

    ask_history: {
      id: 'ask_history',
      title: 'Medical History',
      icon: '📋',
      type: 'dialogue',
      actionLabel: 'Ask about her medical history',
      content: [
        { kind: 'family', text: '"High blood pressure for years. And the heart thing — atrial fibrillation, they called it. No diabetes. Never smoked. Nothing like this has ever happened before."' },
        { kind: 'narrate', text: '"Any recent falls, head injury, headaches, seizures?"' },
        { kind: 'family', text: '"No, nothing. No headache today either — I asked her."' },
        { kind: 'result', text: 'Hypertension + atrial fibrillation: a high-risk substrate for cardioembolic stroke. Absence of headache and trauma makes hemorrhage and migraine less likely, though only CT can exclude a bleed.' },
      ],
      finding: {
        id: 'f_history',
        label: 'HTN + atrial fibrillation; no headache or trauma',
        detail: 'Atrial fibrillation is the classic source of cardioembolic stroke. No headache, trauma, or seizure history — mimics and hemorrhage are less likely.',
        befast: null,
      },
      unlocks: [],
    },

    ask_meds: {
      id: 'ask_meds',
      title: 'Medications',
      icon: '💊',
      type: 'dialogue',
      actionLabel: 'Ask what medications she takes',
      content: [
        { kind: 'family', text: '"Lisinopril for the pressure. And she was on that blood thinner — apixaban — but she stopped it about a month ago on her own. Said it made her bruise too easily. I told her to call the doctor..."' },
        { kind: 'result', text: 'Atrial fibrillation, NOT anticoagulated for the past month. Her embolic risk is essentially untreated — and importantly, no anticoagulant on board removes a major contraindication to thrombolysis.' },
      ],
      finding: {
        id: 'f_meds',
        label: 'A-fib anticoagulation self-discontinued 1 month ago',
        detail: 'Off apixaban ×1 month: high embolic risk, and no anticoagulant contraindication if thrombolytics are indicated.',
        befast: null,
      },
      unlocks: [],
    },

    /* ----------------------------- PRIMARY SURVEY -------------------------- */

    primary_survey: {
      id: 'primary_survey',
      title: 'Primary Survey & Vitals',
      icon: '🩺',
      type: 'exam',
      actionLabel: 'ABCs and full vitals',
      content: [
        { kind: 'narrate', text: 'Airway patent, breathing unlabored. You attach the monitor.' },
        { kind: 'result', text: 'BP 182/94 · HR 96, irregularly irregular · RR 16 · SpO₂ 97% RA · Temp 36.8°C. The radial pulse confirms it: irregularly irregular.' },
        { kind: 'narrate', text: 'Hypertensive, with an irregular rhythm. The monitor is suspicious for atrial fibrillation — a 12-lead would confirm. A focused neuro exam and a glucose are the next priorities.' },
      ],
      finding: {
        id: 'f_vitals',
        label: 'BP 182/94, irregularly irregular pulse',
        detail: 'Hypertension is common in acute stroke. The irregularly irregular pulse suggests atrial fibrillation pending ECG confirmation.',
        befast: null,
      },
      unlocks: ['focused_neuro', 'glucose_check', 'ecg'],
    },

    glucose_check: {
      id: 'glucose_check',
      title: 'POC Glucose',
      icon: '🩸',
      type: 'test',
      actionLabel: 'Check point-of-care glucose',
      content: [
        { kind: 'narrate', text: 'A quick fingerstick — hypoglycemia is the great stroke imitator and takes ten seconds to exclude.' },
        { kind: 'result', text: 'Glucose: 104 mg/dL. Normal.' },
        { kind: 'narrate', text: 'Hypoglycemia is ruled out. Her focal deficits cannot be explained by low sugar.' },
      ],
      finding: {
        id: 'f_glucose',
        label: 'Glucose 104 mg/dL — hypoglycemia excluded',
        detail: 'A normal POC glucose rules out the most common and most treatable stroke mimic. Required before activating a stroke alert.',
        befast: null,
      },
      unlocks: [],
    },

    ecg: {
      id: 'ecg',
      title: '12-Lead ECG',
      icon: '📈',
      type: 'test',
      actionLabel: 'Obtain a 12-lead ECG',
      content: [
        { kind: 'result', text: 'ECG: Atrial fibrillation, ventricular rate 96. No ST-segment changes, no ectopy.' },
        { kind: 'narrate', text: 'Confirmed atrial fibrillation — and per the husband, she has been off anticoagulation for a month. A cardioembolic source is sitting right in front of you.' },
      ],
      finding: {
        id: 'f_ecg',
        label: 'ECG: atrial fibrillation, rate 96',
        detail: 'Confirmed a-fib establishes a plausible cardioembolic mechanism for an acute ischemic stroke.',
        befast: null,
      },
      unlocks: [],
    },

    /* ----------------------------- FOCUSED NEURO --------------------------- */

    focused_neuro: {
      id: 'focused_neuro',
      title: 'Focused Neuro Exam',
      icon: '🔦',
      type: 'exam',
      actionLabel: 'Begin focused neurological exam',
      content: [
        { kind: 'narrate', text: 'You position yourself at the foot of the bed where she can see you, and work through a focused, BEFAST-oriented neurological exam.' },
        { kind: 'narrate', text: 'Choose your assessments. Each one tests a different domain — and each is revisitable.' },
      ],
      unlocks: ['face_exam', 'arm_exam', 'speech_exam', 'eye_exam', 'balance_exam'],
    },

    face_exam: {
      id: 'face_exam',
      title: 'Facial Symmetry',
      icon: '😐',
      type: 'exam',
      actionLabel: 'Ask her to smile and show her teeth',
      content: [
        { kind: 'narrate', text: '"Mrs. Vance, give me a big smile — show me all your teeth."' },
        { kind: 'result', text: 'The right side of her mouth rises. The left lower face barely moves — a clear left lower facial droop. Forehead wrinkling is symmetric (upper face spared).' },
        { kind: 'narrate', text: 'Lower facial weakness with a spared forehead is the central (upper motor neuron) pattern — cortical, not Bell\'s palsy.' },
      ],
      finding: {
        id: 'f_face',
        label: 'Left lower facial droop (forehead spared)',
        detail: 'NIHSS 4: partial paralysis of the lower left face. Forehead sparing localizes the lesion centrally — consistent with a right-hemisphere stroke.',
        befast: 'F',
      },
      unlocks: [],
    },

    arm_exam: {
      id: 'arm_exam',
      title: 'Pronator Drift',
      icon: '💪',
      type: 'exam',
      actionLabel: 'Test arm drift (10-second hold)',
      content: [
        { kind: 'narrate', text: '"Close your eyes and hold both arms straight out, palms up, for ten seconds."' },
        { kind: 'result', text: 'The right arm holds steady. The left arm pronates and drifts downward, falling to the bed within 5 seconds. Grip on the left is weak.' },
        { kind: 'narrate', text: 'Unilateral pronator drift — one of the most reliable bedside signs of corticospinal tract dysfunction.' },
      ],
      finding: {
        id: 'f_arm',
        label: 'Left arm pronator drift, falls within 5s',
        detail: 'NIHSS 5a: left arm drifts to the bed before 10 seconds. Unilateral upper-extremity weakness — the "A" in BEFAST.',
        befast: 'A',
      },
      unlocks: [],
    },

    speech_exam: {
      id: 'speech_exam',
      title: 'Formal Speech Test',
      icon: '🗨️',
      type: 'exam',
      actionLabel: 'Test repetition and naming',
      content: [
        { kind: 'narrate', text: '"Repeat after me: \'You can\'t teach an old dog new tricks.\'" You then point to your watch and pen and ask her to name them.' },
        { kind: 'patient', text: '"You... cann\'t teash... an ol\' dog..." The words are correct but badly slurred. She names the watch and pen accurately, with the same slurring.' },
        { kind: 'result', text: 'Moderate dysarthria with intact naming and comprehension. Language is preserved; articulation is not.' },
      ],
      finding: {
        id: 'f_speech_formal',
        label: 'Dysarthria on formal testing, language intact',
        detail: 'NIHSS 10: slurred but intelligible speech with preserved naming/comprehension. Documents the "S" deficit objectively.',
        befast: 'S',
      },
      unlocks: [],
    },

    eye_exam: {
      id: 'eye_exam',
      title: 'Eyes & Vision',
      icon: '👁️',
      type: 'exam',
      actionLabel: 'Examine gaze and visual fields',
      content: [
        { kind: 'narrate', text: 'Two distinct assessments here — gaze tracking and visual fields. Run them both.' },
      ],
      unlocks: ['gaze_check', 'visual_fields'],
    },

    gaze_check: {
      id: 'gaze_check',
      title: 'Gaze Tracking',
      icon: '👀',
      type: 'exam',
      actionLabel: 'Have her follow your finger',
      content: [
        { kind: 'narrate', text: '"Follow my finger with just your eyes."' },
        { kind: 'result', text: 'Her eyes rest preferentially toward the right. She tracks across the midline to the left with effort — a right gaze preference, not a forced deviation.' },
        { kind: 'narrate', text: 'The eyes "look toward" a destructive hemispheric lesion. A right gaze preference points to the right hemisphere — concordant with her left-sided weakness.' },
      ],
      finding: {
        id: 'f_gaze',
        label: 'Right gaze preference (overcomes midline)',
        detail: 'NIHSS 2: partial gaze palsy. Eyes deviate toward the lesioned right hemisphere; she can cross midline voluntarily.',
        befast: 'E',
      },
      unlocks: [],
    },

    visual_fields: {
      id: 'visual_fields',
      title: 'Visual Fields',
      icon: '🎯',
      type: 'exam',
      actionLabel: 'Test fields by confrontation',
      content: [
        { kind: 'narrate', text: 'You test each quadrant by confrontation, wiggling fingers in her periphery, then check blink-to-threat.' },
        { kind: 'result', text: 'She misses finger movement in the left hemifield of both eyes and does not blink to threat from the left. A left homonymous hemianopia.' },
        { kind: 'narrate', text: 'A field cut respecting the vertical midline in both eyes is cortical — right occipito-parietal territory.' },
      ],
      finding: {
        id: 'f_fields',
        label: 'Left homonymous hemianopia',
        detail: 'NIHSS 3: complete left visual field loss in both eyes with absent blink-to-threat. A cortical visual deficit — the "E" in BEFAST.',
        befast: 'E',
      },
      unlocks: [],
    },

    balance_exam: {
      id: 'balance_exam',
      title: 'Balance & Coordination',
      icon: '⚖️',
      type: 'exam',
      actionLabel: 'Assess sitting balance and coordination',
      content: [
        { kind: 'narrate', text: 'You raise the head of the bed and ask her to sit at the edge, then test finger-to-nose on both sides. (She is not safe to stand — you do not attempt gait.)' },
        { kind: 'result', text: 'She lists steadily to the left and cannot sit unsupported. Finger-to-nose on the left is dysmetric — overshooting past your finger; the right is accurate.' },
        { kind: 'narrate', text: 'Truncal instability plus left-sided dysmetria: her balance and coordination are objectively impaired on the same side as everything else.' },
      ],
      finding: {
        id: 'f_balance',
        label: 'Unable to sit unsupported; left dysmetria',
        detail: 'Acute truncal ataxia with left limb dysmetria — the "B" in BEFAST. Lateralizes with her other right-hemisphere findings.',
        befast: 'B',
      },
      unlocks: [],
    },
  },
};
