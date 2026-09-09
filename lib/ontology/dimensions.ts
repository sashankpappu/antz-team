import { Dimension } from '@prisma/client';

/**
 * The universal meta-ontology.
 *
 * Nine dimensions, domain-agnostic. Every automation request has all nine
 * whatever the industry, so there are no industry packs here and there never
 * should be — domain specificity is harvested from the customer's own
 * artifacts (see lib/claims/vocabulary.ts), not authored by us.
 *
 * Slots are the scoreable units. A dimension's score is filled slots over
 * total slots; the overall score is the mean of the dimensions.
 */

export interface SlotDef {
  /** Stable key, unique within its dimension. Persisted on Claim.slot. */
  key: string;
  /** Business-language name. Safe to show an exec. */
  label: string;
  /**
   * The question this slot forces, in business language. Used as the seed for
   * question generation and as the fallback when generation is unavailable —
   * so it must never contain words like "actor", "system of record", "SLA",
   * "schema" or "integration".
   */
  forces: string;
  /**
   * How much a developer is blocked without this. 3 = cannot start, 2 = will
   * guess and may guess wrong, 1 = can proceed and ask later.
   */
  blockingWeight: 1 | 2 | 3;
  /**
   * Slots that only become sensible to ask once this one is answered, as
   * "DIMENSION.slot_key" references. Actors and Systems unlock the most, which
   * is why the ranking algorithm reaches them early without being told to.
   */
  unlocks: string[];
}

export interface DimensionDef {
  dimension: Dimension;
  /** Business-language name. */
  label: string;
  /** The question the dimension as a whole forces. */
  forces: string;
  slots: SlotDef[];
}

export const ONTOLOGY: DimensionDef[] = [
  {
    dimension: Dimension.ACTORS,
    label: 'Actors',
    forces: 'Who does this, who receives it, who approves it',
    slots: [
      {
        key: 'initiator',
        label: 'Who kicks it off',
        forces: 'Who is the person who starts this off?',
        blockingWeight: 3,
        unlocks: ['TRIGGERS.what_starts_it'],
      },
      {
        key: 'performer',
        label: 'Who does the work',
        forces: 'Who actually does the work today, by name or by role?',
        blockingWeight: 3,
        unlocks: [
          'ACTORS.approver',
          'HANDOFFS.team_boundaries',
          'DECISION_RULES.rule_owner',
          'EXCEPTIONS.who_catches_it',
        ],
      },
      {
        key: 'approver',
        label: 'Who signs off',
        forces: 'Does anyone have to sign off before it goes ahead?',
        blockingWeight: 2,
        unlocks: ['DECISION_RULES.thresholds', 'DECISION_RULES.escalation_criteria'],
      },
      {
        key: 'recipient',
        label: 'Who gets the result',
        forces: 'Who is waiting on the result, and what do they do with it?',
        blockingWeight: 2,
        unlocks: ['DATA.outputs', 'DONE_CRITERIA.acceptance_owner'],
      },
      {
        key: 'exception_handler',
        label: 'Who picks up the mess',
        forces: 'When it goes wrong, whose problem does it become?',
        blockingWeight: 2,
        unlocks: ['EXCEPTIONS.current_workaround'],
      },
    ],
  },
  {
    dimension: Dimension.TRIGGERS,
    label: 'Triggers',
    forces: 'What starts it, how often, scheduled or event',
    slots: [
      {
        key: 'what_starts_it',
        label: 'What sets it off',
        forces: 'What has to happen for this work to begin?',
        blockingWeight: 3,
        unlocks: [
          'TRIGGERS.frequency',
          'TRIGGERS.scheduled_vs_event',
          'VOLUMES.transactions_per_period',
        ],
      },
      {
        key: 'frequency',
        label: 'How often',
        forces: 'How often does that happen — a few times a day, a week, a month?',
        blockingWeight: 2,
        unlocks: ['TRIGGERS.seasonality', 'VOLUMES.peak'],
      },
      {
        key: 'scheduled_vs_event',
        label: 'Clock or event',
        forces:
          'Does it run at a set time, or the moment something lands?',
        blockingWeight: 2,
        unlocks: [],
      },
      {
        key: 'seasonality',
        label: 'Busy periods',
        forces: 'Are there times of year when this gets much heavier?',
        blockingWeight: 1,
        unlocks: [],
      },
    ],
  },
  {
    dimension: Dimension.SYSTEMS,
    label: 'Systems',
    forces: 'What is touched, what is read, what is written',
    slots: [
      {
        key: 'systems_read',
        label: 'Where the information is looked up',
        forces: 'Which screens or files does someone open to get the information?',
        blockingWeight: 3,
        unlocks: [
          'DATA.inputs',
          'DATA.where_it_lives_today',
          'SYSTEMS.integration_method',
        ],
      },
      {
        key: 'systems_written',
        label: 'Where the result is put',
        forces: 'Where does the result get typed, saved or sent?',
        blockingWeight: 3,
        unlocks: [
          'DATA.outputs',
          'SYSTEMS.system_of_record',
          'HANDOFFS.system_boundaries',
        ],
      },
      {
        key: 'system_of_record',
        label: 'Where the truth lives',
        forces:
          'If two of those disagree, which one does everyone treat as right?',
        blockingWeight: 3,
        unlocks: ['DATA.quality_trust'],
      },
      {
        key: 'integration_method',
        label: 'How it is got at today',
        forces:
          'Does anyone pull that out automatically today, or is it copied by hand?',
        blockingWeight: 2,
        unlocks: [],
      },
    ],
  },
  {
    dimension: Dimension.DATA,
    label: 'Data',
    forces: 'What comes in, what goes out, where it lives now',
    slots: [
      {
        key: 'inputs',
        label: 'What comes in',
        forces: 'What information does the person need in front of them to start?',
        blockingWeight: 3,
        unlocks: ['DATA.format', 'DATA.quality_trust'],
      },
      {
        key: 'outputs',
        label: 'What comes out',
        forces: 'What exists at the end that did not exist at the start?',
        blockingWeight: 3,
        unlocks: ['DONE_CRITERIA.measurement'],
      },
      {
        key: 'where_it_lives_today',
        label: 'Where it sits now',
        forces: 'Where does that information actually live right now?',
        blockingWeight: 2,
        unlocks: [],
      },
      {
        key: 'format',
        label: 'What shape it arrives in',
        forces: 'Does that arrive as a spreadsheet, an email, a report, something else?',
        blockingWeight: 2,
        unlocks: [],
      },
      {
        key: 'quality_trust',
        label: 'How much it is trusted',
        forces: 'How often is that information wrong or out of date?',
        blockingWeight: 2,
        unlocks: ['EXCEPTIONS.known_failure_modes'],
      },
    ],
  },
  {
    dimension: Dimension.DECISION_RULES,
    label: 'Decision rules',
    forces: 'What logic decides the outcome, who owns the rules',
    slots: [
      {
        key: 'logic',
        label: 'How the call gets made',
        forces: 'How does the person decide which way it goes?',
        blockingWeight: 3,
        unlocks: [
          'DECISION_RULES.thresholds',
          'DECISION_RULES.escalation_criteria',
          'EXCEPTIONS.known_failure_modes',
        ],
      },
      {
        key: 'rule_owner',
        label: 'Who owns the rules',
        forces: 'Who gets to change that rule if the business changes its mind?',
        blockingWeight: 2,
        unlocks: [],
      },
      {
        key: 'thresholds',
        label: 'The numbers in the rule',
        forces: 'Is there an amount or a cut-off where the answer changes?',
        blockingWeight: 2,
        unlocks: [],
      },
      {
        key: 'escalation_criteria',
        label: 'When it goes up the chain',
        forces: 'What makes someone say "this one needs my manager"?',
        blockingWeight: 2,
        unlocks: [],
      },
    ],
  },
  {
    dimension: Dimension.EXCEPTIONS,
    label: 'Exceptions',
    forces: 'What happens when it fails, who catches it',
    slots: [
      {
        key: 'known_failure_modes',
        label: 'What usually goes wrong',
        forces: 'What is the thing that most often goes wrong with this?',
        blockingWeight: 3,
        unlocks: [
          'EXCEPTIONS.current_workaround',
          'EXCEPTIONS.who_catches_it',
          'EXCEPTIONS.frequency',
        ],
      },
      {
        key: 'current_workaround',
        label: 'What people do about it',
        forces: 'When that happens, what does someone do to get round it?',
        blockingWeight: 2,
        unlocks: [],
      },
      {
        key: 'who_catches_it',
        label: 'Who notices',
        forces: 'Who spots it, and how long before they do?',
        blockingWeight: 2,
        unlocks: ['HANDOFFS.wait_states'],
      },
      {
        key: 'frequency',
        label: 'How often it goes wrong',
        forces: 'Roughly how often does that happen — weekly, monthly, rarely?',
        blockingWeight: 1,
        unlocks: [],
      },
    ],
  },
  {
    dimension: Dimension.HANDOFFS,
    label: 'Handoffs',
    forces: 'Where work crosses a team or system boundary',
    slots: [
      {
        key: 'team_boundaries',
        label: 'Where it changes hands',
        forces: 'At what point does this leave your team and land with someone else?',
        blockingWeight: 3,
        // Knowing where work crosses a boundary is what makes the questions
        // about who receives it and who catches a failure there answerable.
        unlocks: [
          'HANDOFFS.wait_states',
          'HANDOFFS.sla_at_each',
          'ACTORS.recipient',
          'EXCEPTIONS.who_catches_it',
        ],
      },
      {
        key: 'system_boundaries',
        label: 'Where it changes place',
        forces: 'Does anyone have to re-key it from one place into another?',
        blockingWeight: 2,
        // Re-keying by hand is where format and trust problems show up.
        unlocks: ['DATA.format', 'DATA.quality_trust'],
      },
      {
        key: 'wait_states',
        label: 'Where it sits waiting',
        forces: 'Where does this normally sit and wait on somebody?',
        blockingWeight: 2,
        unlocks: [],
      },
      {
        key: 'sla_at_each',
        label: 'How long before someone chases',
        forces: 'How long is too long before someone starts chasing it?',
        blockingWeight: 2,
        unlocks: ['DONE_CRITERIA.measurement'],
      },
    ],
  },
  {
    dimension: Dimension.VOLUMES,
    label: 'Volumes',
    forces: 'How many, how fast, at peak',
    slots: [
      {
        key: 'transactions_per_period',
        label: 'How many',
        forces: 'How many of these go through in a normal week?',
        blockingWeight: 3,
        unlocks: ['VOLUMES.peak', 'VOLUMES.growth', 'VOLUMES.size_of_each'],
      },
      {
        key: 'peak',
        label: 'At the worst moment',
        forces: 'What does that look like on your busiest day?',
        blockingWeight: 2,
        unlocks: [],
      },
      {
        key: 'growth',
        label: 'Where it is heading',
        forces: 'Is that number growing, and how fast?',
        blockingWeight: 1,
        unlocks: [],
      },
      {
        key: 'size_of_each',
        label: 'How big each one is',
        forces: 'Is each one a couple of lines, or hundreds?',
        blockingWeight: 1,
        unlocks: [],
      },
    ],
  },
  {
    dimension: Dimension.DONE_CRITERIA,
    label: 'Done-criteria',
    forces: 'How anyone knows this worked',
    slots: [
      {
        key: 'success_definition',
        label: 'What good looks like',
        forces: 'If this worked perfectly, what would be different for you?',
        blockingWeight: 3,
        unlocks: [
          'DONE_CRITERIA.measurement',
          'DONE_CRITERIA.current_baseline',
          'DONE_CRITERIA.acceptance_owner',
        ],
      },
      {
        key: 'measurement',
        label: 'How you would know',
        forces: 'What would you look at to know it was working?',
        blockingWeight: 3,
        unlocks: [],
      },
      {
        key: 'current_baseline',
        label: 'Where it stands today',
        forces: 'What is that number today, before we change anything?',
        blockingWeight: 2,
        unlocks: [],
      },
      {
        key: 'acceptance_owner',
        label: 'Who says it is done',
        forces: 'Who is the person who gets to say this is finished?',
        blockingWeight: 2,
        unlocks: [],
      },
    ],
  },
];

/**
 * Entry order through the ontology by inferred role. Same ontology for
 * everyone — only the order changes, so a COO is asked about handoffs and
 * volumes early and a finance head about approvals and controls.
 *
 * Matched as a case-insensitive substring against the inferred role, longest
 * key first, so "Group CFO" matches "cfo" and "VP Operations" matches
 * "operations".
 *
 * Titles are written a dozen ways and a miss here silently costs the exec the
 * ordering, so the aliases at the bottom cover the phrasings that do not
 * contain the obvious key — "Chief Operating Officer" contains neither "coo"
 * nor "operations".
 */
const ORDERS: Record<string, Dimension[]> = {
  default: [
    Dimension.ACTORS,
    Dimension.SYSTEMS,
    Dimension.TRIGGERS,
    Dimension.DATA,
    Dimension.DECISION_RULES,
    Dimension.HANDOFFS,
    Dimension.EXCEPTIONS,
    Dimension.VOLUMES,
    Dimension.DONE_CRITERIA,
  ],
  coo: [
    Dimension.HANDOFFS,
    Dimension.VOLUMES,
    Dimension.ACTORS,
    Dimension.EXCEPTIONS,
    Dimension.SYSTEMS,
    Dimension.TRIGGERS,
    Dimension.DECISION_RULES,
    Dimension.DATA,
    Dimension.DONE_CRITERIA,
  ],
  operations: [
    Dimension.HANDOFFS,
    Dimension.VOLUMES,
    Dimension.EXCEPTIONS,
    Dimension.ACTORS,
    Dimension.SYSTEMS,
    Dimension.TRIGGERS,
    Dimension.DECISION_RULES,
    Dimension.DATA,
    Dimension.DONE_CRITERIA,
  ],
  cfo: [
    Dimension.DECISION_RULES,
    Dimension.ACTORS,
    Dimension.DONE_CRITERIA,
    Dimension.DATA,
    Dimension.SYSTEMS,
    Dimension.EXCEPTIONS,
    Dimension.HANDOFFS,
    Dimension.VOLUMES,
    Dimension.TRIGGERS,
  ],
  finance: [
    Dimension.DECISION_RULES,
    Dimension.ACTORS,
    Dimension.DATA,
    Dimension.DONE_CRITERIA,
    Dimension.SYSTEMS,
    Dimension.EXCEPTIONS,
    Dimension.HANDOFFS,
    Dimension.VOLUMES,
    Dimension.TRIGGERS,
  ],
  cio: [
    Dimension.SYSTEMS,
    Dimension.DATA,
    Dimension.HANDOFFS,
    Dimension.ACTORS,
    Dimension.EXCEPTIONS,
    Dimension.VOLUMES,
    Dimension.TRIGGERS,
    Dimension.DECISION_RULES,
    Dimension.DONE_CRITERIA,
  ],
  cto: [
    Dimension.SYSTEMS,
    Dimension.DATA,
    Dimension.VOLUMES,
    Dimension.EXCEPTIONS,
    Dimension.ACTORS,
    Dimension.HANDOFFS,
    Dimension.TRIGGERS,
    Dimension.DECISION_RULES,
    Dimension.DONE_CRITERIA,
  ],
  supply: [
    Dimension.SYSTEMS,
    Dimension.HANDOFFS,
    Dimension.EXCEPTIONS,
    Dimension.VOLUMES,
    Dimension.ACTORS,
    Dimension.TRIGGERS,
    Dimension.DATA,
    Dimension.DECISION_RULES,
    Dimension.DONE_CRITERIA,
  ],
  sales: [
    Dimension.ACTORS,
    Dimension.TRIGGERS,
    Dimension.DONE_CRITERIA,
    Dimension.HANDOFFS,
    Dimension.DECISION_RULES,
    Dimension.SYSTEMS,
    Dimension.DATA,
    Dimension.EXCEPTIONS,
    Dimension.VOLUMES,
  ],
};

export const ROLE_ENTRY_ORDER: Record<string, Dimension[]> = {
  ...ORDERS,
  // Aliases for how people actually write their titles.
  operating: ORDERS.operations,
  ops: ORDERS.operations,
  fulfilment: ORDERS.operations,
  fulfillment: ORDERS.operations,
  controller: ORDERS.finance,
  accounting: ORDERS.finance,
  treasury: ORDERS.finance,
  procurement: ORDERS.supply,
  logistics: ORDERS.supply,
  planning: ORDERS.supply,
  technology: ORDERS.cto,
  engineering: ORDERS.cto,
  information: ORDERS.cio,
  revenue: ORDERS.sales,
  commercial: ORDERS.sales,
};
