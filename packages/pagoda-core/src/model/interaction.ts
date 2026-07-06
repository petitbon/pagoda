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

export type PagodaInteractionSpec = {
  mode: 'generated';
  persona?: {
    id: string;
    traits?: string[];
  };
  slots?: Record<string, PagodaInteractionSlot>;
  turns: PagodaInteractionTurnTemplate[];
  coverage?: PagodaInteractionCoverage;
};

export type PagodaMaterializedInteraction = {
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
