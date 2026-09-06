import { generatePlatformOutputs, type PlatformId } from "./platforms";
import type {
  AnalysisResult,
  GenerationResult,
  Opportunity,
  OpportunityKind,
} from "./types";

const STOPWORDS = new Set(
  `a an the and or but if in on at to for of as is are was were be been being it this that those these with from by not no so than then just into over after before about up out your you we they i me my our their them there here what when where how why who which can could should would will may might must do does did doing have has had having too very more most other some any each few such own same only also still even because while during without within across per via etc vs plus like get got make made know known think thought want need use used using go going went come came see look take give put say said telling tell`.split(
    /\s+/,
  ),
);

const WEAK_TOPIC_WORDS = new Set([
  "one",
  "long",
  "piece",
  "today",
  "host",
  "people",
  "something",
  "thing",
  "things",
  "week",
  "full",
  "sitting",
  "welcome",
  "back",
  "assume",
  "actually",
  "true",
  "part",
  "last",
  "next",
  "same",
]);

const GENERIC_SINGLE_TOPICS = new Set([
  "content",
  "posts",
  "moments",
  "video",
  "newsletter",
]);

const TENSION_PATTERNS: Array<{ test: RegExp; weight: number }> = [
  { test: /\d+(\.\d+)?%|\b\d{1,3}(,\d{3})+\b|\b\d+\s?(hours?|weeks?|days?|months?|million|thousand|k)\b/i, weight: 3 },
  { test: /\b(but|however|instead|actually|the truth|nobody|mistake|secret|wait|stop)\b/i, weight: 2.4 },
  { test: /\b(never|always|every|biggest|worst|best|brutal|useless|obvious)\b/i, weight: 1.4 },
  { test: /\?/, weight: 1.6 },
  { test: /\b(I|we|my|our)\b/, weight: 1.2 },
  { test: /["“].{12,}["”]/, weight: 1.8 },
  { test: /\b(rule|system|framework|question|packaging|inventory|operation|recast)\b/i, weight: 1.3 },
];

function normalize(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").trim();
}

function splitSentences(text: string): string[] {
  const cleaned = text
    .replace(/^[A-Za-z]+:\s*/gm, "")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned
    .split(/(?<=[.!?])\s+(?=[A-Z“"0-9])/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 28 && sentence.split(/\s+/).length >= 6);
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2 && !STOPWORDS.has(word) && !/^\d+$/.test(word));
}

function scoreSentence(sentence: string): number {
  let score = 0;
  for (const pattern of TENSION_PATTERNS) {
    if (pattern.test.test(sentence)) score += pattern.weight;
  }
  const words = sentence.split(/\s+/).length;
  if (words >= 10 && words <= 36) score += 1.1;
  if (words > 50) score -= 1;
  return score;
}

function cleanQuote(text: string): string {
  return text
    .replace(/[“”"']/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function titleCase(phrase: string): string {
  return phrase.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function titleFromSentence(sentence: string): string {
  const clipped = cleanQuote(sentence).replace(/[.]+$/, "");
  if (clipped.length <= 72) return clipped;
  const cut = clipped.slice(0, 70);
  const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > 40 ? lastSpace : 70).trim()}…`;
}

function rewriteAsHook(sentence: string, variant: number): string {
  const short = titleFromSentence(sentence);
  const patterns = [
    short.endsWith("?") ? short : `The line that changes the piece: ${short}`,
    `The line I almost cut: ${short}`,
    `Nobody wants to say this out loud: ${short}`,
  ];
  return patterns[variant % patterns.length];
}

function uniqueBy<T>(items: T[], keyOf: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = keyOf(item).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isStrongPhrase(phrase: string): boolean {
  const parts = phrase.split(/\s+/);
  if (parts.length === 1 && GENERIC_SINGLE_TOPICS.has(parts[0])) return false;
  if (parts.some((part) => WEAK_TOPIC_WORDS.has(part) || STOPWORDS.has(part))) return false;
  return parts.every((part) => part.length > 2);
}

function extractTopics(text: string): Array<{ title: string; excerpt: string; why: string }> {
  const sentences = splitSentences(text);
  const words = tokenize(text);
  const counts = new Map<string, number>();
  const bigrams = new Map<string, number>();
  const trigrams = new Map<string, number>();

  for (const word of words) {
    counts.set(word, (counts.get(word) ?? 0) + 1);
  }
  for (let i = 0; i < words.length - 1; i += 1) {
    bigrams.set(`${words[i]} ${words[i + 1]}`, (bigrams.get(`${words[i]} ${words[i + 1]}`) ?? 0) + 1);
  }
  for (let i = 0; i < words.length - 2; i += 1) {
    const triple = `${words[i]} ${words[i + 1]} ${words[i + 2]}`;
    trigrams.set(triple, (trigrams.get(triple) ?? 0) + 1);
  }

  const quoted = [...text.matchAll(/["“]([^"”]{8,60})["”]/g)].map((match) =>
    match[1].toLowerCase().replace(/[^a-z0-9\s-]/g, " ").replace(/\s+/g, " ").trim(),
  );

  const rankedPhrases = [
    ...[...trigrams.entries()].filter(([, count]) => count >= 2).map(([phrase, count]) => ({ phrase, count: count + 1 })),
    ...[...bigrams.entries()].map(([phrase, count]) => ({ phrase, count })),
    ...quoted.filter(Boolean).map((phrase) => ({ phrase, count: 3 })),
    ...[...counts.entries()]
      .filter(([word, count]) => count >= 3 && !WEAK_TOPIC_WORDS.has(word) && word.length > 4)
      .map(([phrase, count]) => ({ phrase, count })),
  ]
    .filter((item) => isStrongPhrase(item.phrase))
    .sort((a, b) => {
      const scoreA = a.count * (a.phrase.includes(" ") ? 3 : 1);
      const scoreB = b.count * (b.phrase.includes(" ") ? 3 : 1);
      return scoreB - scoreA;
    });

  const candidates = uniqueBy(rankedPhrases, (item) => item.phrase).slice(0, 4);

  return candidates.map((item) => {
    const excerpt =
      sentences.find((sentence) => sentence.toLowerCase().includes(item.phrase)) ??
      sentences.find((sentence) => item.phrase.split(" ").every((word) => sentence.toLowerCase().includes(word))) ??
      sentences[0] ??
      text.slice(0, 180);
    return {
      title: titleCase(item.phrase),
      excerpt: cleanQuote(excerpt),
      why: `This theme is load-bearing in the source and can be recast as a series, a hook, or a standalone post without losing the original point.`,
    };
  });
}

function buildWhy(kind: OpportunityKind, sentence: string): string {
  if (/\d/.test(sentence)) {
    return "Specific numbers make the claim believable and give short-form posts a concrete hook instead of a vague opinion.";
  }
  if (/\?/.test(sentence)) {
    return "A sharp question creates an open loop. That is what stops a scroll and starts a comment thread.";
  }
  if (/\b(but|however|instead|actually|stop|nobody)\b/i.test(sentence)) {
    return "Contrast and belief-breaking lines travel well. Platforms reward content that argues with a common assumption.";
  }
  if (kind === "moment") {
    return "This is a reusable scene: it has tension, a clear takeaway, and enough texture to become a clip, caption, or short.";
  }
  if (kind === "hook") {
    return "The first line can stand alone. That is the difference between a post people finish and a post people skip.";
  }
  return "This angle gives the same source a different job, so you are not publishing the same insight in four costumes.";
}

export function analyzeLocally(sourceText: string): AnalysisResult {
  const text = normalize(sourceText);
  const sentences = splitSentences(text);
  const ranked = uniqueBy(
    sentences
      .map((sentence, index) => ({ sentence, index, score: scoreSentence(sentence) }))
      .sort((a, b) => b.score - a.score),
    (item) => item.sentence.slice(0, 80),
  );

  const topics = extractTopics(text).map((topic, index) => ({
    id: `topic-${index + 1}`,
    kind: "topic" as const,
    title: topic.title,
    excerpt: topic.excerpt,
    whyValuable: topic.why,
  }));

  const moments = ranked.slice(0, 3).map((item, index) => ({
    id: `moment-${index + 1}`,
    kind: "moment" as const,
    title: titleFromSentence(item.sentence),
    excerpt: cleanQuote(item.sentence),
    whyValuable: buildWhy("moment", item.sentence),
  }));

  const hookSeeds = (ranked.filter((item) => item.score >= 3).slice(0, 3).length > 0
    ? ranked.filter((item) => item.score >= 3).slice(0, 3)
    : ranked.slice(0, 3));
  const hooks = hookSeeds.map((item, index) => ({
    id: `hook-${index + 1}`,
    kind: "hook" as const,
    title: rewriteAsHook(item.sentence, index),
    excerpt: cleanQuote(item.sentence),
    whyValuable: buildWhy("hook", item.sentence),
  }));

  const leadTopic =
    [...topics].sort((a, b) => {
      const words = b.title.split(/\s+/).length - a.title.split(/\s+/).length;
      return words !== 0 ? words : b.title.length - a.title.length;
    })[0]?.title ?? "this idea";
  const leadMoment = moments[0]?.excerpt ?? sentences[0] ?? text.slice(0, 140);
  const angles: Opportunity[] = [
    {
      id: "angle-1",
      kind: "angle",
      title: `Contrarian: what people get wrong about ${leadTopic.toLowerCase()}`,
      excerpt: leadMoment,
      whyValuable:
        "A contrarian frame makes the same source feel new. It is the fastest way to turn a long piece into a debate people want to join.",
    },
    {
      id: "angle-2",
      kind: "angle",
      title: `How-to: turn ${leadTopic.toLowerCase()} into a repeatable system`,
      excerpt:
        sentences.find((sentence) =>
          /\b(rule is|repeatable|do not edit|identify the opportunities|system that)\b/i.test(
            sentence,
          ),
        ) ?? leadMoment,
      whyValuable:
        "How-to packaging is easier to buy and easier to save. It turns insight into an asset people come back to.",
    },
    {
      id: "angle-3",
      kind: "angle",
      title: "Story: the moment the idea became obvious",
      excerpt:
        sentences.find((sentence) =>
          /\b(used to|months ago|real example|I was|I did not)\b/i.test(sentence),
        ) ?? leadMoment,
      whyValuable:
        "A lived story carries more trust than advice. Short-form platforms still reward a scene with a turn.",
    },
  ];

  const opportunities = uniqueBy(
    [...topics.slice(0, 3), ...moments, ...hooks, ...angles],
    (item) => item.title,
  );

  return { engine: "local", opportunities };
}

export function generateLocally(
  sourceText: string,
  opportunities: Opportunity[],
  platforms: PlatformId[],
): GenerationResult {
  return {
    engine: "local",
    platforms,
    outputs: generatePlatformOutputs(sourceText, opportunities, platforms),
  };
}
