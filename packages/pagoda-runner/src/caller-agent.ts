import type {
  PagodaCallerAgentDecision,
  PagodaMaterializedAgenticInteraction,
  PagodaTargetTurn
} from '@petitbon/pagoda-core';
import type {
  PagodaCallerAgentProvider,
  PagodaCallerDecisionInput
} from '@petitbon/pagoda-adapter-sdk';

export type { PagodaCallerAgentProvider, PagodaCallerDecisionInput } from '@petitbon/pagoda-adapter-sdk';

export class DeterministicCallerAgentProvider implements PagodaCallerAgentProvider {
  readonly id = 'deterministic-caller';
  readonly model = undefined;
  readonly deterministic = true;

  async decide(input: PagodaCallerDecisionInput): Promise<PagodaCallerAgentDecision> {
    const allowed = new Set(input.interaction.interventionPolicy.triggers);
    const latest = input.observedTurns.at(-1)?.text ?? '';
    if (!latest) {
      return {
        action: 'answer',
        text: input.interaction.goal.summary,
        rationale: 'No target turn has been observed; opening with the caller goal.'
      };
    }

    const correction = correctionForConflictingFact(input.interaction, latest, allowed);
    if (correction) return correction;

    if (matchesStopPattern(input.interaction, latest)) {
      return { action: 'end', rationale: 'The target matched an explicit termination.stopOn pattern.' };
    }

    const normalized = normalizeText(latest);
    if (isConsentQuestion(normalized)
      && allowed.has('accept-valid-option')
      && hasPriorValidOption(input.interaction, input.observedTurns)) {
      if (hasPriorDecision(input.previousDecisions, 'accept')) {
        return { action: 'wait', rationale: 'The caller has already accepted an option.' };
      }
      return {
        action: 'accept',
        text: 'That works for me.',
        rationale: 'The target requested consent after offering an acceptable option.'
      };
    }

    if (hasCompletionCue(latest)) {
      if (!completionIsNegated(latest)
        && completionMatchesGoal(input.interaction, latest)
        && allowed.has('end-when-complete')) {
        return { action: 'end', rationale: 'The target reported completion matching the declared caller goal.' };
      }
      if (allowed.has('verify-confirmation') && !hasPriorDecision(input.previousDecisions, 'verify')) {
        return {
          action: 'verify',
          text: 'Can you confirm the completed details?',
          rationale: 'The target appears to report completion and confirmation is permitted.'
        };
      }
    }

    if (isValidOption(input.interaction, latest) && allowed.has('accept-valid-option')) {
      if (hasPriorDecision(input.previousDecisions, 'accept')) {
        return { action: 'wait', rationale: 'The caller has already accepted an option.' };
      }
      return {
        action: 'accept',
        text: 'That works for me.',
        rationale: 'The target offered an option matching the declared goal expectations.'
      };
    }

    if (isAmbiguousOption(input.interaction, latest) && allowed.has('ask-clarification')) {
      return {
        action: 'ask_clarification',
        text: 'What are the specific details of that option?',
        rationale: 'The proposed option does not contain enough declared goal detail.'
      };
    }

    if (isOutOfPolicy(input.interaction, latest) && allowed.has('reject-out-of-policy')) {
      return {
        action: 'reject',
        text: 'That does not match what I asked for. Is there an option that does?',
        rationale: 'The target proposal does not match the declared facts or acceptable alternatives.'
      };
    }

    if (appearsToAskQuestion(normalized) && allowed.has('answer-question')) {
      return {
        action: 'answer',
        text: input.interaction.goal.summary,
        rationale: 'The target asked a question and answer-question is permitted.'
      };
    }

    return { action: 'wait', rationale: 'No permitted target-neutral intervention applies.' };
  }
}

const normalizeText = (text: string): string => text
  .toLowerCase()
  .replace(/[\u2018\u2019]/g, "'")
  .replace(/\s+/g, ' ')
  .trim();

const tokenize = (text: string): string[] => normalizeText(text).match(/[a-z0-9]+/g) ?? [];

const containsTokenSequence = (textTokens: readonly string[], phraseTokens: readonly string[]): boolean => {
  if (phraseTokens.length === 0 || phraseTokens.length > textTokens.length) return false;
  return textTokens.some((_token, index) =>
    phraseTokens.every((phraseToken, offset) => textTokens[index + offset] === phraseToken)
  );
};

const containsPhrase = (text: string, phrase: string): boolean =>
  containsTokenSequence(tokenize(text), tokenize(phrase));

const stopWords = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'for', 'from', 'in', 'is', 'it',
  'of', 'on', 'or', 'that', 'the', 'to', 'was', 'were', 'with'
]);

const significantTokens = (text: string): string[] =>
  tokenize(text).filter((token) => (token.length > 1 || /^\d+$/.test(token)) && !stopWords.has(token));

const matchesStatement = (text: string, expected: string): boolean => {
  if (containsPhrase(text, expected)) return true;
  const observed = new Set(significantTokens(text));
  const required = significantTokens(expected);
  return required.length > 0 && required.every((token) => observed.has(token));
};

const declaredFacts = (
  interaction: PagodaMaterializedAgenticInteraction
): Array<[string, string]> => Object.entries(interaction.goal.facts ?? {})
  .filter((entry): entry is [string, string | number | boolean] => entry[1] !== null)
  .map(([name, value]) => [name, String(value)]);

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const assignedFactValue = (text: string, factName: string): string | undefined => {
  const expandedFactName = factName.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
  const namePattern = normalizeText(expandedFactName)
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map(escapeRegExp)
    .join('[\\s_-]+');
  if (!namePattern) return undefined;
  const pattern = new RegExp(
    `(?:^|\\b)${namePattern}\\s*(?::|=|\\bis\\b|\\bare\\b|\\bwas\\b|\\bwere\\b)\\s*([^.!?,;]+)`,
    'i'
  );
  return pattern.exec(text)?.[1]?.trim();
};

const correctionForConflictingFact = (
  interaction: PagodaMaterializedAgenticInteraction,
  latest: string,
  allowed: ReadonlySet<string>
): PagodaCallerAgentDecision | null => {
  if (!allowed.has('correct-conflicting-fact')) return null;
  for (const [name, expected] of declaredFacts(interaction)) {
    const assigned = assignedFactValue(latest, name);
    if (!assigned || matchesStatement(assigned, expected)) continue;
    const label = name
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/[-_]+/g, ' ')
      .toLowerCase();
    return {
      action: 'correct',
      text: `I need ${label} to be ${expected}.`,
      rationale: `The target explicitly assigned a conflicting value to ${label}.`
    };
  }
  return null;
};

const matchesAcceptableAlternative = (
  interaction: PagodaMaterializedAgenticInteraction,
  text: string
): boolean => {
  const alternatives = interaction.goal.acceptableAlternatives ?? [];
  return alternatives.length === 0 || alternatives.some((alternative) =>
    matchesStatement(text, alternative) && !statementIsNegated(text, alternative)
  );
};

const matchesDeclaredFacts = (
  interaction: PagodaMaterializedAgenticInteraction,
  text: string
): boolean => {
  const facts = declaredFacts(interaction);
  return facts.length === 0 || facts.every(([, value]) =>
    matchesStatement(text, value) && !statementIsNegated(text, value)
  );
};

const hasOptionCue = (text: string): boolean =>
  /\b(available|alternative|choice|offer|option|propose|proposal)\b/.test(normalizeText(text))
  || /\b(can|could)\s+(?:do|offer|provide|use)\b/.test(normalizeText(text));

const hasDeclaredExpectation = (interaction: PagodaMaterializedAgenticInteraction): boolean =>
  declaredFacts(interaction).length > 0 || (interaction.goal.acceptableAlternatives?.length ?? 0) > 0;

const isValidOption = (interaction: PagodaMaterializedAgenticInteraction, latest: string): boolean =>
  hasOptionCue(latest)
  && hasDeclaredExpectation(interaction)
  && ((interaction.goal.acceptableAlternatives?.length ?? 0) > 0
    ? matchesAcceptableAlternative(interaction, latest)
    : matchesDeclaredFacts(interaction, latest));

const isAmbiguousOption = (interaction: PagodaMaterializedAgenticInteraction, latest: string): boolean => {
  if (!hasOptionCue(latest)) return false;
  const mentionsFact = declaredFacts(interaction).some(([, value]) => matchesStatement(latest, value));
  const mentionsAlternative = (interaction.goal.acceptableAlternatives ?? [])
    .some((alternative) => matchesStatement(latest, alternative));
  return !mentionsFact && !mentionsAlternative;
};

const isOutOfPolicy = (interaction: PagodaMaterializedAgenticInteraction, latest: string): boolean =>
  hasOptionCue(latest) && hasDeclaredExpectation(interaction) && !isValidOption(interaction, latest);

const hasPriorDecision = (
  decisions: readonly PagodaCallerAgentDecision[],
  action: PagodaCallerAgentDecision['action']
): boolean => decisions.some((decision) => decision.action === action);

const hasCompletionCue = (text: string): boolean =>
  /\b(complete|completed|confirmed|done|finished|resolved|succeeded|successful)\b/.test(normalizeText(text))
  || /\ball set\b/.test(normalizeText(text));

const completionNegators = new Set([
  'no', 'not', 'never', 'cannot', 'cant', 'wont', 'won', 'dont', 'don', 'doesnt', 'doesn', 'didnt', 'didn',
  'nothing', 'without', 'unable'
]);

const hasNegatingToken = (tokens: readonly string[]): boolean => tokens.some((token, index) => {
  if (!completionNegators.has(token)) return false;
  return !(token === 'no' && (tokens[index + 1] === 'problem' || tokens[index + 1] === 'worries'));
});

const statementIsNegated = (text: string, expected: string): boolean => {
  const textTokens = tokenize(text);
  const expectedTokens = tokenize(expected);
  let matchIndex = textTokens.findIndex((_token, index) =>
    expectedTokens.every((token, offset) => textTokens[index + offset] === token)
  );
  if (matchIndex < 0) {
    const indexes = significantTokens(expected)
      .map((token) => textTokens.indexOf(token))
      .filter((index) => index >= 0);
    matchIndex = indexes.length > 0 ? Math.min(...indexes) : -1;
  }
  if (matchIndex < 0) return false;
  return hasNegatingToken(textTokens.slice(Math.max(0, matchIndex - 8), matchIndex));
};

const completionIsNegated = (text: string): boolean => {
  const tokens = tokenize(text);
  const cueIndex = tokens.findIndex((token) =>
    ['complete', 'completed', 'confirmed', 'done', 'finished', 'resolved', 'succeeded', 'successful'].includes(token)
  );
  return cueIndex >= 0 && hasNegatingToken(tokens.slice(Math.max(0, cueIndex - 8), cueIndex));
};

const completionMatchesGoal = (
  interaction: PagodaMaterializedAgenticInteraction,
  text: string
): boolean => {
  if (matchesStopPattern(interaction, text)) return true;
  if (interaction.goal.successCriteria.some((criterion) => matchesStatement(text, criterion))) return true;
  return hasDeclaredExpectation(interaction)
    && matchesDeclaredFacts(interaction, text)
    && matchesAcceptableAlternative(interaction, text);
};

const matchesStopPattern = (
  interaction: PagodaMaterializedAgenticInteraction,
  text: string
): boolean => {
  const textTokens = tokenize(text);
  return (interaction.termination.stopOn ?? []).some((pattern) => {
    const patternTokens = tokenize(pattern);
    const matchIndex = textTokens.findIndex((_token, index) =>
      patternTokens.every((token, offset) => textTokens[index + offset] === token)
    );
    if (matchIndex < 0) return false;
    const precedingContext = textTokens.slice(Math.max(0, matchIndex - 8), matchIndex);
    return !hasNegatingToken(precedingContext);
  });
};

const appearsToAskQuestion = (normalizedText: string): boolean =>
  normalizedText.includes('?')
  || /(?:^|[.!]\s+)(can|could|would|will|should|do|does|did|is|are|what|which|when|who|where|why|how)\b/.test(normalizedText);

const isConsentQuestion = (normalizedText: string): boolean =>
  appearsToAskQuestion(normalizedText)
  && /\b(accept|approve|choose|confirm|proceed|select|set|use)\b/.test(normalizedText)
  && /\b(that|this|it|alternative|choice|offer|option|proposal)\b/.test(normalizedText);

const hasPriorValidOption = (
  interaction: PagodaMaterializedAgenticInteraction,
  observedTurns: readonly PagodaTargetTurn[]
): boolean => observedTurns.slice(0, -1).some((turn) => isValidOption(interaction, turn.text));
