import type { Memory, RetrievedMemory } from './schemas.js';

const DAY_MS = 86_400_000;
const STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'at',
  'be',
  'by',
  'do',
  'for',
  'get',
  'i',
  'in',
  'is',
  'it',
  'me',
  'my',
  'of',
  'on',
  'or',
  'our',
  'please',
  'the',
  'to',
  'with',
]);
const RELATED_TERMS = [
  ['meeting', 'meetings', 'call', 'calls', 'calendar', 'schedule', 'scheduling', 'board'],
  ['email', 'emails', 'draft', 'writing'],
  ['prepare', 'preparation', 'prep', 'ready'],
  ['morning', 'mornings', 'am'],
  ['afternoon', 'afternoons', 'pm'],
  ['minute', 'minutes', 'min'],
];

export function tokenize(value: string): string[] {
  return (value.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter(
    (word) => !STOP_WORDS.has(word),
  );
}

function queryTerms(query: string): Map<string, number> {
  const original = new Set(tokenize(query));
  const terms = new Map([...original].map((term) => [term, 1]));
  for (const group of RELATED_TERMS) {
    if (group.some((term) => original.has(term))) {
      for (const term of group) if (!terms.has(term)) terms.set(term, 0.45);
    }
  }
  return terms;
}

/** A small BM25 implementation: weighted key/value terms, confidence, then recency. */
export function rankMemories(
  memories: Memory[],
  query: string,
  now: Date,
  k: number,
): RetrievedMemory[] {
  const terms = queryTerms(query);
  if (terms.size === 0) return [];

  const documents = memories
    .filter((memory) => !memory.archived)
    .map((memory) => {
      const tokens = [
        ...tokenize(memory.key),
        ...tokenize(memory.key),
        ...tokenize(memory.value),
        ...tokenize(memory.value),
        ...tokenize(memory.rationale),
      ];
      const counts = new Map<string, number>();
      for (const token of tokens) counts.set(token, (counts.get(token) ?? 0) + 1);
      return { memory, counts, length: Math.max(1, tokens.length) };
    });
  if (documents.length === 0) return [];

  const averageLength =
    documents.reduce((total, document) => total + document.length, 0) / documents.length;
  const documentFrequency = new Map<string, number>();
  for (const term of terms.keys()) {
    documentFrequency.set(term, documents.filter((document) => document.counts.has(term)).length);
  }

  return documents
    .flatMap(({ memory, counts, length }) => {
      let overlap = 0;
      const matched: string[] = [];
      for (const [term, weight] of terms) {
        const frequency = counts.get(term) ?? 0;
        if (frequency === 0) continue;
        const df = documentFrequency.get(term) ?? 0;
        const idf = Math.log(1 + (documents.length - df + 0.5) / (df + 0.5));
        const termScore =
          (frequency * 2.2) / (frequency + 1.2 * (0.25 + (0.75 * length) / averageLength));
        overlap += idf * termScore * weight;
        matched.push(term);
      }
      if (overlap === 0 || memory.confidence === 0) return [];

      // Maintenance updates updated_at; it must not make idle memories appear recent.
      const ageDays = Math.max(
        0,
        (now.getTime() - Date.parse(memory.last_used_at ?? memory.created_at)) / DAY_MS,
      );
      const recencyBoost = 1 + 0.2 * Math.exp(-ageDays / 30);
      const score = overlap * memory.confidence * recencyBoost;
      return [
        {
          ...memory,
          score: Math.round(score * 1_000_000) / 1_000_000,
          why_retrieved: `Matched ${matched
            .slice(0, 4)
            .map((term) => `“${term}”`)
            .join(
              ', ',
            )}; ${Math.round(memory.confidence * 100)}% confidence; ${ageDays < 1 ? 'recently created or used' : `last active ${Math.floor(ageDays)} days ago`}.`,
        },
      ];
    })
    .sort(
      (a, b) =>
        b.score - a.score || b.updated_at.localeCompare(a.updated_at) || a.id.localeCompare(b.id),
    )
    .slice(0, k);
}
