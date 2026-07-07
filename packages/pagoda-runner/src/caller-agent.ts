import type {
  PagodaCallerAgentDecision,
  PagodaMaterializedAgenticInteraction,
  PagodaTargetTurn
} from '@petitbon/pagoda-core';

export type PagodaCallerDecisionInput = {
  interaction: PagodaMaterializedAgenticInteraction;
  observedTurns: PagodaTargetTurn[];
  previousDecisions: PagodaCallerAgentDecision[];
};

export interface PagodaCallerAgentProvider {
  readonly id: string;
  readonly model?: string;
  readonly deterministic: boolean;
  decide(input: PagodaCallerDecisionInput): Promise<PagodaCallerAgentDecision>;
}

export class DeterministicCallerAgentProvider implements PagodaCallerAgentProvider {
  readonly id = 'deterministic-caller';
  readonly model = undefined;
  readonly deterministic = true;

  async decide(input: PagodaCallerDecisionInput): Promise<PagodaCallerAgentDecision> {
    const allowed = new Set(input.interaction.interventionPolicy.triggers);
    const latest = input.observedTurns.at(-1)?.text ?? '';
    const normalized = normalizeText(latest);
    if (!latest) {
      return {
        action: 'answer',
        text: input.interaction.goal.summary,
        rationale: 'No target turn has been observed; opening with the caller goal.'
      };
    }
    const correction = correctionForKnownFact(input.interaction, latest, allowed);
    if (correction) return correction;
    if (isConsentQuestion(normalized) && allowed.has('accept-valid-option') && hasPriorValidOption(input.interaction, input.observedTurns)) {
      if (hasPriorDecision(input.previousDecisions, 'accept')) return { action: 'wait', rationale: 'The caller has already accepted an option.' };
      return { action: 'accept', text: 'That works for me.', rationale: 'The target asked for consent after offering an acceptable option.' };
    }
    if (hasCompletionCue(latest)) {
      if (completionMatchesKnownFacts(input.interaction, latest)) {
        if (allowed.has('end-when-complete')) {
          return { action: 'end', rationale: 'The target confirmed completion with matching known facts.' };
        }
        if (allowed.has('verify-confirmation')) {
          return { action: 'verify', text: 'Can you confirm the details?', rationale: 'The target appears to be confirming an outcome.' };
        }
      } else if (allowed.has('verify-confirmation') && !hasPriorDecision(input.previousDecisions, 'verify')) {
        return { action: 'verify', text: 'Can you confirm the details?', rationale: 'The target appears to be confirming an outcome without enough matching detail.' };
      } else if (allowed.has('ask-clarification')) {
        return { action: 'ask_clarification', text: 'What are the confirmed details?', rationale: 'The target repeated a confirmation without enough detail.' };
      }
    }
    if (isValidOption(input.interaction, latest) && allowed.has('accept-valid-option')) {
      if (hasPriorDecision(input.previousDecisions, 'accept')) return { action: 'wait', rationale: 'The caller has already accepted an option.' };
      return { action: 'accept', text: 'That works for me.', rationale: 'The target appears to have offered an acceptable explicit option.' };
    }
    if (isAmbiguousOption(input.interaction, latest) && allowed.has('ask-clarification')) {
      return { action: 'ask_clarification', text: 'What are the details of that option?', rationale: 'The proposed option is ambiguous.' };
    }
    if (isOutOfPolicy(input.interaction, latest) && allowed.has('reject-out-of-policy')) {
      return { action: 'reject', text: 'That does not work for me. Is there an option that matches what I asked for?', rationale: 'The target proposal appears outside the caller policy.' };
    }
    if (appearsToAskQuestion(normalized) && allowed.has('answer-question')) {
      return {
        action: 'answer',
        text: input.interaction.goal.summary,
        rationale: 'The target appears to ask a question and answer-question is allowed.'
      };
    }
    return { action: 'wait', rationale: 'No permitted intervention applies to the latest target turn.' };
  }
}

const factText = (interaction: PagodaMaterializedAgenticInteraction, name: string): string | undefined => {
  const value = interaction.goal.facts?.[name];
  return typeof value === 'string' && value.trim() ? value : undefined;
};

const correctionForKnownFact = (
  interaction: PagodaMaterializedAgenticInteraction,
  latest: string,
  allowed: ReadonlySet<string>
): PagodaCallerAgentDecision | null => {
  const checks: Array<{ fact: string; trigger: string; label: string }> = [
    { fact: 'service', trigger: 'correct-wrong-service', label: 'service' },
    { fact: 'staff', trigger: 'correct-wrong-staff', label: 'staff' },
    { fact: 'date', trigger: 'correct-wrong-date', label: 'date' },
    { fact: 'time', trigger: 'correct-wrong-time', label: 'time' }
  ];
  for (const check of checks) {
    const expected = factText(interaction, check.fact);
    if (!expected || !allowed.has(check.trigger)) continue;
    if (mentionsDomain(latest, check.fact) && !matchesFact(check.fact, expected, latest)) {
      return {
        action: 'correct',
        text: `I wanted ${expected} for the ${check.label}.`,
        rationale: `The target appears to mention a different ${check.label}.`
      };
    }
  }
  return null;
};

const mentionsDomain = (text: string, fact: string): boolean => {
  const normalized = normalizeText(text);
  if (fact === 'staff') return /\b(with|by|staff|stylist|barber|provider|norman|alex|sam|jordan)\b/.test(normalized);
  if (fact === 'service') return /\b(service|haircut|cut|color|trim)\b/.test(normalized);
  if (fact === 'date') return /\b(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d{4}-\d{2}-\d{2})\b/.test(normalized);
  if (fact === 'time') return extractTimes(normalized).length > 0 || /\b(morning|afternoon|evening)\b/.test(normalized);
  return false;
};

const isOutOfPolicy = (interaction: PagodaMaterializedAgenticInteraction, latest: string): boolean => {
  const alternatives = interaction.goal.acceptableAlternatives ?? [];
  if (alternatives.length === 0) return false;
  const normalized = normalizeText(latest);
  const optionMentioned = normalized.includes('available') || normalized.includes('option') || normalized.includes('can do') || normalized.includes('have');
  if (!optionMentioned) return false;
  return alternatives.every((alternative) => !matchesAcceptableAlternative(latest, alternative));
};

const isAmbiguousOption = (interaction: PagodaMaterializedAgenticInteraction, latest: string): boolean => {
  const normalized = normalizeText(latest);
  const optionMentioned = normalized.includes('available') || normalized.includes('option') || normalized.includes('can do') || normalized.includes('have');
  if (!optionMentioned) return false;
  const mentionsFact = declaredDomainFacts(interaction)
    .some(([name, value]) => matchesFact(name, value, latest));
  const wordCount = tokenize(latest).length;
  return !mentionsFact && (normalized.includes('option') || wordCount <= 5);
};

const isValidOption = (interaction: PagodaMaterializedAgenticInteraction, latest: string): boolean => {
  const normalized = normalizeText(latest);
  const optionMentioned = normalized.includes('available') || normalized.includes('option') || normalized.includes('can do') || normalized.includes('have');
  if (!optionMentioned) return false;
  for (const [name, value] of declaredDomainFacts(interaction)) {
    if (!matchesFact(name, value, latest)) return false;
  }
  const alternatives = interaction.goal.acceptableAlternatives ?? [];
  return alternatives.length === 0 || alternatives.some((alternative) => matchesAcceptableAlternative(latest, alternative));
};

const hasPriorDecision = (decisions: readonly PagodaCallerAgentDecision[], action: PagodaCallerAgentDecision['action']): boolean =>
  decisions.some((decision) => decision.action === action);

const hasCompletionCue = (text: string): boolean =>
  /\b(booked|confirmed|complete|completed|scheduled|reserved)\b/.test(normalizeText(text))
  || /\ball set\b/.test(normalizeText(text));

const completionCandidateSentences = (text: string): string[] =>
  normalizeText(text)
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => stripTrailingServiceQuestion(sentence.trim()))
    .filter((sentence) => sentence.length > 0 && hasCompletionCue(sentence) && !appearsToAskQuestion(sentence) && !isNegatedCompletion(sentence));

const stripTrailingServiceQuestion = (normalizedText: string): string =>
  normalizedText
    .replace(/\b(?:is there anything else|can i help(?: you)? with anything else|do you need anything else|would you like anything else|anything else)\s*[?.!]*$/i, '')
    .trim();

const completionCuePattern = '(?:booked|confirm|confirmed|complete|completed|scheduled|reserved|set)';
const strongCompletionNegatorPattern = "(?:not|never|cannot|can't|cant|won't|wont|unable to|isn't|isnt|aren't|arent|wasn't|wasnt|don't|dont|doesn't|doesnt|didn't|didnt|haven't|havent|hasn't|hasnt|hadn't|hadnt)";
const bookingObjectPattern = '(?:appointments?|bookings?|reservations?|slots?|times?|availability)';
const completionContextPattern = "[\\w\\s'.-]{0,60}";

const strongNegatorBeforeCompletion = new RegExp(`\\b${strongCompletionNegatorPattern}\\b${completionContextPattern}\\b${completionCuePattern}\\b`);
const completionBeforeStrongNegator = new RegExp(`\\b${completionCuePattern}\\b${completionContextPattern}\\b${strongCompletionNegatorPattern}\\b`);
const noBookingObjectBeforeCompletion = new RegExp(`\\bno\\s+${bookingObjectPattern}\\b${completionContextPattern}\\b${completionCuePattern}\\b`);
const nothingBeforeCompletion = new RegExp(`\\bnothing\\b${completionContextPattern}\\b${completionCuePattern}\\b`);

const isNegatedCompletion = (normalizedText: string): boolean =>
  strongNegatorBeforeCompletion.test(normalizedText)
  || completionBeforeStrongNegator.test(normalizedText)
  || noBookingObjectBeforeCompletion.test(normalizedText)
  || nothingBeforeCompletion.test(normalizedText);

const appearsToAskQuestion = (normalizedText: string): boolean =>
  normalizedText.includes('?')
  || /(?:^|[.!]\s+)(can|could|would|will|should|do|does|did|is|are|what|which|when|who|where|why|how)\b/.test(normalizedText.trim());

const isConsentQuestion = (normalizedText: string): boolean =>
  appearsToAskQuestion(normalizedText)
  && /\b(book|schedule|reserve|confirm|set)\b/.test(normalizedText)
  && /\b(that|this|it|option|appointment|time)\b/.test(normalizedText);

const hasPriorValidOption = (
  interaction: PagodaMaterializedAgenticInteraction,
  observedTurns: readonly PagodaTargetTurn[]
): boolean =>
  observedTurns.slice(0, -1).some((turn) => isValidOption(interaction, turn.text));

const declaredDomainFacts = (interaction: PagodaMaterializedAgenticInteraction): Array<[string, string]> =>
  ['service', 'staff', 'date', 'time']
    .map((name): [string, string | undefined] => [name, factText(interaction, name)])
    .filter((entry): entry is [string, string] => entry[1] !== undefined);

const completionMatchesKnownFacts = (interaction: PagodaMaterializedAgenticInteraction, text: string): boolean => {
  const facts = declaredDomainFacts(interaction);
  if (facts.length === 0) return false;
  return completionCandidateSentences(text)
    .some((sentence) => facts.every(([name, value]) => matchesFact(name, value, sentence)));
};

const normalizeText = (text: string): string => text
  .toLowerCase()
  .replace(/[\u2018\u2019]/g, "'")
  .replace(/\ba\.m\./g, 'am')
  .replace(/\bp\.m\./g, 'pm');

const tokenize = (text: string): string[] => normalizeText(text).match(/[a-z0-9]+/g) ?? [];

const containsWordSequence = (text: string, phrase: string): boolean => {
  const textTokens = tokenize(text);
  const phraseTokens = tokenize(phrase);
  return containsTokenSequence(textTokens, phraseTokens);
};

const containsTokenSequence = (textTokens: string[], phraseTokens: string[]): boolean => {
  if (phraseTokens.length === 0 || phraseTokens.length > textTokens.length) return false;
  return textTokens.some((_token, index) =>
    phraseTokens.every((phraseToken, offset) => textTokens[index + offset] === phraseToken)
  );
};

const stopWords = new Set([
  'a',
  'an',
  'and',
  'at',
  'before',
  'for',
  'of',
  'or',
  'that',
  'the',
  'to',
  'with',
  'within'
]);

const guardTokens = new Set(['approval', 'approve', 'approved', 'effect', 'effects', 'safe', 'safely', 'side']);

const significantTokens = (text: string): string[] =>
  tokenize(text).filter((word) => word.length > 1 && !stopWords.has(word));

const matchesAcceptableAlternative = (text: string, alternative: string): boolean => {
  if (containsWordSequence(text, alternative)) return true;
  const textTokens = new Set(tokenize(text));
  const significant = significantTokens(alternative);
  if (significant.length === 0) return false;
  if (significant.some((token) => guardTokens.has(token)) && !significant
    .filter((token) => guardTokens.has(token))
    .every((token) => textTokens.has(token))) {
    return false;
  }
  if (significant.every((token) => textTokens.has(token))) return true;
  const firstGuardIndex = significant.findIndex((token) => guardTokens.has(token));
  if (firstGuardIndex < 0) return false;
  return containsTokenSequence(significantTokens(text), significant.slice(firstGuardIndex));
};

const matchesFact = (name: string, expected: string, text: string): boolean => {
  if (name === 'time') {
    const expectedTimes = extractTimes(expected);
    const observedTimes = extractTimes(text);
    if (expectedTimes.length > 0 && observedTimes.length > 0) {
      return expectedTimes.some((expectedTime) => observedTimes.includes(expectedTime));
    }
  }
  return containsWordSequence(text, expected);
};

const extractTimes = (text: string): number[] => {
  const normalized = normalizeText(text);
  const times: number[] = [];
  for (const match of normalized.matchAll(/\b([01]?\d|2[0-3]):([0-5]\d)\b/g)) {
    const hour = Number(match[1]);
    const minute = Number(match[2]);
    times.push(hour * 60 + minute);
  }
  for (const match of normalized.matchAll(/\b(1[0-2]|0?[1-9])(?:[: ]([0-5]\d))?\s*(a\.?m\.?|p\.?m\.?)\b/g)) {
    let hour = Number(match[1]);
    const minute = match[2] ? Number(match[2]) : 0;
    const meridiem = match[3].replace(/\./g, '');
    if (meridiem === 'am' && hour === 12) hour = 0;
    if (meridiem === 'pm' && hour !== 12) hour += 12;
    times.push(hour * 60 + minute);
  }
  return [...new Set(times)];
};
