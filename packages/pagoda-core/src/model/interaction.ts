export type PagodaInteractionValue = string | number | boolean | null;

export type PagodaInteractionCoverage = {
  strategy: 'seeded-pairwise';
  maxCases?: number;
};

export type PagodaInteractionSlot = {
  values: PagodaInteractionValue[];
};

export type PagodaInteractionTurnTemplate = {
  id: string;
  actor: 'user';
  templates: string[];
  after?: 'channel-ready' | 'assistant-response';
  delayMs?: number;
};

export type PagodaInteractionPersona = {
  id: string;
  traits?: string[];
};

export type PagodaGeneratedInteractionSpec = {
  mode: 'generated';
  persona?: PagodaInteractionPersona;
  slots?: Record<string, PagodaInteractionSlot>;
  turns: PagodaInteractionTurnTemplate[];
  coverage?: PagodaInteractionCoverage;
};

export type PagodaAgenticInterventionTrigger =
  | 'answer-question'
  | 'ask-clarification'
  | 'correct-wrong-service'
  | 'correct-wrong-staff'
  | 'correct-wrong-date'
  | 'correct-wrong-time'
  | 'reject-out-of-policy'
  | 'accept-valid-option'
  | 'verify-confirmation'
  | 'end-when-complete';

export type PagodaAgenticInteractionGoal = {
  summary: string;
  facts?: Record<string, PagodaInteractionValue>;
  acceptableAlternatives?: string[];
  successCriteria: string[];
};

export type PagodaAgenticInteractionKnowledge = {
  knownFacts?: string[];
  unknownFacts?: string[];
  disclosureRules?: string[];
};

export type PagodaAgenticInterventionPolicy = {
  triggers: PagodaAgenticInterventionTrigger[];
  patience?: 'low' | 'medium' | 'high';
};

export type PagodaAgenticTerminationPolicy = {
  maxTurns: number;
  maxDurationMs?: number;
  stopOn?: string[];
};

export type PagodaAgenticInteractionSpec = {
  mode: 'agentic';
  persona: PagodaInteractionPersona;
  slots?: Record<string, PagodaInteractionSlot>;
  goal: PagodaAgenticInteractionGoal;
  knowledge?: PagodaAgenticInteractionKnowledge;
  interventionPolicy: PagodaAgenticInterventionPolicy;
  termination: PagodaAgenticTerminationPolicy;
  coverage?: PagodaInteractionCoverage;
};

export type PagodaInteractionSpec = PagodaGeneratedInteractionSpec | PagodaAgenticInteractionSpec;

export type PagodaMaterializedGeneratedInteraction = {
  mode?: 'generated';
  caseId: string;
  seed: string;
  slots: Record<string, PagodaInteractionValue>;
  turns: Array<{
    id: string;
    actor: 'user';
    text: string;
    template: string;
    after?: 'channel-ready' | 'assistant-response';
    delayMs?: number;
  }>;
};

export type PagodaMaterializedAgenticInteraction = {
  mode: 'agentic';
  caseId: string;
  seed: string;
  slots: Record<string, PagodaInteractionValue>;
  persona: PagodaInteractionPersona;
  goal: PagodaAgenticInteractionGoal;
  knowledge?: PagodaAgenticInteractionKnowledge;
  interventionPolicy: PagodaAgenticInterventionPolicy;
  termination: PagodaAgenticTerminationPolicy;
};

export type PagodaMaterializedInteraction =
  | PagodaMaterializedGeneratedInteraction
  | PagodaMaterializedAgenticInteraction;

export type PagodaCallerTurn = {
  id: string;
  actor: 'caller';
  text: string;
  decision: string;
  occurredAt?: string;
};

export type PagodaTargetTurn = {
  id: string;
  actor: 'assistant' | 'system';
  text: string;
  occurredAt?: string;
};

export type PagodaCallerAgentDecision = {
  action:
    | 'answer'
    | 'ask_clarification'
    | 'correct'
    | 'reject'
    | 'accept'
    | 'verify'
    | 'wait'
    | 'end';
  text?: string;
  rationale?: string;
};

export type PagodaCallerSession = {
  schemaVersion: 'pagoda.caller-session';
  interactionCaseId: string;
  provider: {
    id: string;
    model?: string;
    deterministic: boolean;
  };
  startedAt: string;
  completedAt: string;
  stopReason: 'completed' | 'max-turns' | 'timeout' | 'adapter-failed' | 'provider-failed';
  turns: Array<PagodaCallerTurn | PagodaTargetTurn>;
  decisions: PagodaCallerAgentDecision[];
};
