import { createHash } from 'node:crypto';
import type {
  PagodaAgenticInteractionGoal,
  PagodaAgenticInteractionKnowledge,
  PagodaAgenticInterventionPolicy,
  PagodaAgenticTerminationPolicy,
  PagodaInteractionSpec,
  PagodaInteractionPersona,
  PagodaInteractionValue,
  PagodaMaterializedInteraction
} from '../model/interaction.js';

export type PagodaInteractionCaseSelector = string | number | undefined;

type CaseCombination = {
  caseId: string;
  slots: Record<string, PagodaInteractionValue>;
};

const stableHash = (value: string): string =>
  createHash('sha256').update(value).digest('hex');

const stableJson = (value: unknown): string => JSON.stringify(value);

const defaultSeed = (scenarioId: string, channel: string): string => `${scenarioId}:${channel}`;

const compareBySeed = (seed: string) => (left: CaseCombination, right: CaseCombination): number => {
  const leftHash = stableHash(`${seed}:${left.caseId}`);
  const rightHash = stableHash(`${seed}:${right.caseId}`);
  const hashCompare = leftHash.localeCompare(rightHash);
  return hashCompare === 0 ? left.caseId.localeCompare(right.caseId) : hashCompare;
};

const pairKey = (
  leftName: string,
  leftValue: PagodaInteractionValue,
  rightName: string,
  rightValue: PagodaInteractionValue
): string =>
  stableJson([[leftName, leftValue], [rightName, rightValue]]);

const parsePairKey = (value: string): [[string, PagodaInteractionValue], [string, PagodaInteractionValue]] =>
  JSON.parse(value) as [[string, PagodaInteractionValue], [string, PagodaInteractionValue]];

const cloneSlots = (slots: Record<string, PagodaInteractionValue>): Record<string, PagodaInteractionValue> => ({
  ...slots
});

const renderStringArray = (
  values: string[] | undefined,
  slots: Record<string, PagodaInteractionValue>
): string[] | undefined =>
  values ? values.map((value) => renderTemplate(value, slots)) : undefined;

const clonePersona = (
  persona: PagodaInteractionPersona,
  slots?: Record<string, PagodaInteractionValue>
): PagodaInteractionPersona => ({
  id: persona.id,
  traits: slots ? renderStringArray(persona.traits, slots) : persona.traits ? [...persona.traits] : undefined
});

const cloneGoal = (
  goal: PagodaAgenticInteractionGoal,
  slots?: Record<string, PagodaInteractionValue>
): PagodaAgenticInteractionGoal => ({
  summary: slots ? renderTemplate(goal.summary, slots) : goal.summary,
  facts: goal.facts
    ? Object.fromEntries(Object.entries(goal.facts).map(([name, value]) => [
        name,
        slots && typeof value === 'string' ? renderTemplate(value, slots) : value
      ]))
    : undefined,
  acceptableAlternatives: slots ? renderStringArray(goal.acceptableAlternatives, slots) : goal.acceptableAlternatives ? [...goal.acceptableAlternatives] : undefined,
  successCriteria: slots ? goal.successCriteria.map((criterion) => renderTemplate(criterion, slots)) : [...goal.successCriteria]
});

const cloneKnowledge = (
  knowledge: PagodaAgenticInteractionKnowledge | undefined,
  slots?: Record<string, PagodaInteractionValue>
): PagodaAgenticInteractionKnowledge | undefined =>
  knowledge
    ? {
        knownFacts: slots ? renderStringArray(knowledge.knownFacts, slots) : knowledge.knownFacts ? [...knowledge.knownFacts] : undefined,
        unknownFacts: slots ? renderStringArray(knowledge.unknownFacts, slots) : knowledge.unknownFacts ? [...knowledge.unknownFacts] : undefined,
        disclosureRules: slots ? renderStringArray(knowledge.disclosureRules, slots) : knowledge.disclosureRules ? [...knowledge.disclosureRules] : undefined
      }
    : undefined;

const cloneInterventionPolicy = (policy: PagodaAgenticInterventionPolicy): PagodaAgenticInterventionPolicy => ({
  triggers: [...policy.triggers],
  patience: policy.patience
});

const cloneTermination = (termination: PagodaAgenticTerminationPolicy): PagodaAgenticTerminationPolicy => ({
  maxTurns: termination.maxTurns,
  maxDurationMs: termination.maxDurationMs,
  stopOn: termination.stopOn ? [...termination.stopOn] : undefined
});

const selectedTemplateIndex = (seed: string, caseId: string, turnId: string, count: number): number => {
  const hash = stableHash(`${seed}:${caseId}:${turnId}`);
  return Number.parseInt(hash.slice(0, 8), 16) % count;
};

const renderTemplate = (template: string, slots: Record<string, PagodaInteractionValue>): string =>
  template.replace(/\{([A-Za-z0-9_-]+)\}/g, (_match, slotName: string) => {
    const value = slots[slotName];
    return value === null ? 'null' : String(value);
  });

const initialRows = (
  firstName: string,
  firstValues: readonly PagodaInteractionValue[],
  secondName: string,
  secondValues: readonly PagodaInteractionValue[]
): Array<Record<string, PagodaInteractionValue>> => {
  const rows: Array<Record<string, PagodaInteractionValue>> = [];
  for (const firstValue of firstValues) {
    for (const secondValue of secondValues) {
      rows.push({ [firstName]: firstValue, [secondName]: secondValue });
    }
  }
  return rows;
};

const generatePairwiseRows = (interaction: PagodaInteractionSpec): Array<Record<string, PagodaInteractionValue>> => {
  const slots = interaction.slots ?? {};
  const slotNames = Object.keys(slots).sort();
  if (slotNames.length === 0) return [{}];
  if (slotNames.length === 1) {
    const [slotName] = slotNames;
    return slots[slotName].values.map((value) => ({ [slotName]: value }));
  }

  let coveredSlotNames = slotNames.slice(0, 2);
  let rows = initialRows(
    coveredSlotNames[0],
    slots[coveredSlotNames[0]].values,
    coveredSlotNames[1],
    slots[coveredSlotNames[1]].values
  );

  for (const newSlotName of slotNames.slice(2)) {
    const newValues = slots[newSlotName].values;
    const uncovered = new Set<string>();
    for (const existingSlotName of coveredSlotNames) {
      for (const existingValue of slots[existingSlotName].values) {
        for (const newValue of newValues) {
          uncovered.add(pairKey(existingSlotName, existingValue, newSlotName, newValue));
        }
      }
    }

    rows = rows.map((row) => {
      let bestValue = newValues[0];
      let bestScore = -1;
      for (const value of newValues) {
        const score = coveredSlotNames.filter((slotName) =>
          uncovered.has(pairKey(slotName, row[slotName], newSlotName, value))
        ).length;
        if (score > bestScore) {
          bestValue = value;
          bestScore = score;
        }
      }
      const nextRow = { ...row, [newSlotName]: bestValue };
      for (const slotName of coveredSlotNames) {
        uncovered.delete(pairKey(slotName, row[slotName], newSlotName, bestValue));
      }
      return nextRow;
    });

    while (uncovered.size > 0) {
      const [requiredPair] = [...uncovered].sort();
      const [[existingSlotName, existingValue], [, newValue]] = parsePairKey(requiredPair);
      const nextRow: Record<string, PagodaInteractionValue> = {};
      for (const slotName of coveredSlotNames) {
        nextRow[slotName] = slots[slotName].values[0];
      }
      nextRow[existingSlotName] = existingValue;
      nextRow[newSlotName] = newValue;

      for (const slotName of coveredSlotNames) {
        if (slotName === existingSlotName) continue;
        let bestValue = slots[slotName].values[0];
        let bestScore = -1;
        for (const value of slots[slotName].values) {
          const score = uncovered.has(pairKey(slotName, value, newSlotName, nextRow[newSlotName])) ? 1 : 0;
          if (score > bestScore) {
            bestValue = value;
            bestScore = score;
          }
        }
        nextRow[slotName] = bestValue;
      }

      for (const slotName of coveredSlotNames) {
        uncovered.delete(pairKey(slotName, nextRow[slotName], newSlotName, nextRow[newSlotName]));
      }
      rows.push(nextRow);
    }

    coveredSlotNames = [...coveredSlotNames, newSlotName];
  }

  return rows.map((row) => {
    const ordered: Record<string, PagodaInteractionValue> = {};
    for (const slotName of slotNames) ordered[slotName] = row[slotName];
    return ordered;
  });
};

const canonicalCases = (interaction: PagodaInteractionSpec): CaseCombination[] => {
  const rows = generatePairwiseRows(interaction);
  const maxCases = interaction.coverage?.maxCases;
  if (maxCases !== undefined && maxCases < rows.length) {
    throw new Error(`interaction.coverage.maxCases ${maxCases} is lower than required pairwise case count ${rows.length}.`);
  }
  return rows.map((slots, index) => ({
    caseId: `case-${String(index + 1).padStart(3, '0')}`,
    slots
  }));
};

const materializeCase = (
  interaction: PagodaInteractionSpec,
  seed: string,
  selected: CaseCombination
): PagodaMaterializedInteraction => {
  if (interaction.mode === 'agentic') {
    return {
      mode: 'agentic',
      caseId: selected.caseId,
      seed,
      slots: cloneSlots(selected.slots),
      persona: clonePersona(interaction.persona, selected.slots),
      goal: cloneGoal(interaction.goal, selected.slots),
      knowledge: cloneKnowledge(interaction.knowledge, selected.slots),
      interventionPolicy: cloneInterventionPolicy(interaction.interventionPolicy),
      termination: cloneTermination(interaction.termination)
    };
  }

  return {
    mode: 'generated',
    caseId: selected.caseId,
    seed,
    slots: cloneSlots(selected.slots),
    turns: interaction.turns.map((turn) => {
      const template = turn.templates[selectedTemplateIndex(seed, selected.caseId, turn.id, turn.templates.length)];
      return {
        id: turn.id,
        actor: turn.actor,
        text: renderTemplate(template, selected.slots),
        template,
        after: turn.after,
        delayMs: turn.delayMs
      };
    })
  };
};

export function listPagodaInteractionCases(input: {
  scenarioId: string;
  channel: string;
  seed?: string;
  interaction: PagodaInteractionSpec;
}): PagodaMaterializedInteraction[] {
  const seed = input.seed ?? defaultSeed(input.scenarioId, input.channel);
  return canonicalCases(input.interaction)
    .sort(compareBySeed(seed))
    .map((interactionCase) => materializeCase(input.interaction, seed, interactionCase));
}

export function materializePagodaInteraction(input: {
  scenarioId: string;
  channel: string;
  seed?: string;
  interaction: PagodaInteractionSpec;
  caseSelector?: PagodaInteractionCaseSelector;
}): PagodaMaterializedInteraction {
  const seed = input.seed ?? defaultSeed(input.scenarioId, input.channel);
  const canonical = canonicalCases(input.interaction);
  const ordered = [...canonical].sort(compareBySeed(seed));
  let selected: CaseCombination | undefined;
  if (input.caseSelector === undefined) {
    selected = ordered[0];
  } else if (typeof input.caseSelector === 'number') {
    selected = canonical[input.caseSelector - 1];
  } else if (/^\d+$/.test(input.caseSelector)) {
    selected = canonical[Number.parseInt(input.caseSelector, 10) - 1];
  } else {
    selected = canonical.find((interactionCase) => interactionCase.caseId === input.caseSelector);
  }
  if (!selected) {
    const valid = canonical.map((interactionCase) => interactionCase.caseId).join(', ');
    throw new Error(`Unknown interaction case ${String(input.caseSelector)}. Valid cases: ${valid}.`);
  }
  return materializeCase(input.interaction, seed, selected);
}
