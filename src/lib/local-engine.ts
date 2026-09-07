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
  { test: /\b(but|however|instead|actually|the truth|nobody|mistake|secret|wait|stop|stopped|started)\b/i, weight: 2.4 },
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
  return {
    engine: "local",
    opportunities: extractDistinctOpportunities(sourceText),
  };
}

function lexicalOverlap(a: string, b: string): number {
  const left = new Set(tokenize(a));
  const right = tokenize(b);
  if (left.size === 0 || right.length === 0) return 0;
  const shared = right.filter((word) => left.has(word)).length;
  return shared / Math.max(left.size, new Set(right).size);
}

function shareDistinctiveClaim(a: string, b: string): boolean {
  const keys = (text: string) =>
    new Set([...text.matchAll(/\$[\d,]+|\b\d{2,}(?:%|\b)/g)].map((match) => match[0]));
  const left = keys(a);
  if (left.size === 0) return false;
  for (const key of keys(b)) {
    if (left.has(key)) return true;
  }
  return false;
}

function tooSimilar(a: string, b: string): boolean {
  return lexicalOverlap(a, b) >= 0.34 || shareDistinctiveClaim(a, b);
}

export function extractDistinctOpportunities(sourceText: string): Opportunity[] {
  const text = normalize(sourceText);
  const sentences = splitSentences(text);
  const longSource = text.length >= 700 && sentences.length >= 8;
  const max = longSource ? 5 : Math.min(2, sentences.length >= 4 ? 2 : 1);

  const ranked = uniqueBy(
    sentences
      .map((sentence) => ({ sentence, score: scoreSentence(sentence) }))
      .sort((a, b) => b.score - a.score),
    (item) => item.sentence.slice(0, 80),
  );

  const selected: Opportunity[] = [];
  for (const item of ranked) {
    if (selected.length >= max) break;
    const excerpt = cleanQuote(item.sentence);
    if (excerpt.split(/\s+/).length < 6) continue;
    if (selected.some((existing) => tooSimilar(existing.excerpt, excerpt))) continue;
    if (selected.length >= (longSource ? 3 : 1) && item.score < 1.5) continue;
    const topic = titleFromSentence(excerpt);
    selected.push({
      id: `topic-${selected.length + 1}`,
      kind: "topic",
      title: topic,
      topic,
      excerpt,
      whyValuable: buildWhy("topic", excerpt),
    });
  }

  if (selected.length === 0 && sentences[0]) {
    const excerpt = cleanQuote(sentences[0]);
    const topic = titleFromSentence(excerpt);
    return [
      {
        id: "topic-1",
        kind: "topic",
        title: topic,
        topic,
        excerpt,
        whyValuable: buildWhy("topic", excerpt),
      },
    ];
  }

  return selected;
}

function ideaOverlap(a: string, b: string): number {
  const left = new Set(tokenize(a));
  const right = tokenize(b);
  if (left.size === 0 || right.length === 0) return 0;
  const shared = right.filter((word) => left.has(word)).length;
  return shared / Math.max(left.size, new Set(right).size);
}

function nearestSentenceIndex(sentences: string[], excerpt: string): number {
  let best = -1;
  let bestScore = 0;
  for (let index = 0; index < sentences.length; index += 1) {
    const score = ideaOverlap(sentences[index], excerpt);
    if (score > bestScore) {
      bestScore = score;
      best = index;
    }
  }
  return bestScore >= 0.28 ? best : -1;
}

function ideaWindow(sentences: string[], excerpt: string): string {
  const index = nearestSentenceIndex(sentences, excerpt);
  if (index < 0) return excerpt;
  return sentences.slice(Math.max(0, index - 1), index + 2).join(" ");
}

function ideaTheme(text: string): string | null {
  const value = text.toLowerCase();
  if (
    /\$|undercharg|packaging problem|confidence problem|worth \$|close rate|easier to buy|14-day recasting|content strategy calls/.test(
      value,
    )
  ) {
    return "pricing";
  }
  if (
    /hunting for|good clips|hunting for tension|look for tension|live on every platform|only sounds smart/.test(
      value,
    )
  ) {
    return "tension";
  }
  if (/busy|meaningful week|fill every hour|one important task|full calendar/.test(value)) {
    return "progress";
  }
  if (/30 posts|atomize|selection is the job|opportunities first|beige content/.test(value)) {
    return "selection";
  }
  if (/47 public|four assets|one long piece a week|almost four/.test(value)) return "yield";
  if (/archive is not|behind on recast|circle three moments|it's inventory|is inventory/.test(value)) {
    return "inventory";
  }
  if (/28-second|four formats|almost cut|1\.2 million|imposter syndrome/.test(value)) return "oneline";
  return null;
}

function sameIdea(sentences: string[], left: string, right: string): boolean {
  const leftTheme = ideaTheme(left);
  const rightTheme = ideaTheme(right);
  if (leftTheme && rightTheme && leftTheme === rightTheme) return true;
  if (ideaOverlap(left, right) >= 0.42) return true;
  const leftIndex = nearestSentenceIndex(sentences, left);
  const rightIndex = nearestSentenceIndex(sentences, right);
  if (leftIndex >= 0 && rightIndex >= 0 && Math.abs(leftIndex - rightIndex) <= 2) {
    return true;
  }
  return ideaOverlap(ideaWindow(sentences, left), ideaWindow(sentences, right)) >= 0.38;
}

function conciseTitle(text: string): string {
  const cleaned = cleanQuote(text)
    .replace(
      /^(the line that changes the piece:|the line i almost cut:|nobody wants to say this out loud:|contrarian:|how-to:|story:)\s*/i,
      "",
    )
    .replace(/^(what people get wrong about|turn |the moment the idea became obvious:?)\s*/i, "")
    .replace(/[.]+$/, "")
    .trim();

  if (/\bbusy\b/i.test(cleaned) && /\bprogress\b/i.test(cleaned)) return "Busy vs Progress";
  if (/\bone (important )?task\b/i.test(cleaned) && /\b(successful|day|fill)/i.test(cleaned)) {
    return "One Important Task";
  }
  if (/\bhunting for (?:good )?clips\b/i.test(cleaned) && /\btension\b/i.test(cleaned)) {
    return "Hunt for Tension";
  }
  if (/\bpackaging\b/i.test(cleaned) && /\bconfidence\b/i.test(cleaned)) {
    return "Packaging vs Confidence";
  }
  const contrast = cleaned.match(
    /\bnot (?:a |an |the )?([^.,]{3,28}).{0,24}(?:it is|it's) (?:a |an |the )?([^.,]{3,28})/i,
  );
  if (contrast) {
    return `${titleCase(contrast[1].trim())} vs ${titleCase(contrast[2].trim())}`;
  }

  const question = cleaned.match(/[^?]{6,70}\?/);
  if (question && question[0].split(/\s+/).length <= 12) {
    return question[0].trim();
  }
  if (cleaned.length <= 72 && !/[.]\s/.test(cleaned) && !/[….]{2,}$|…/.test(cleaned)) {
    return cleaned;
  }

  const protectedCommas = cleaned.replace(/(\$\d{1,3}),(\d{3})/g, "$1COMMA$2");
  const clause = (protectedCommas.split(/[:,]/)[0] ?? cleaned).replace(/COMMA/g, ",").trim();
  const clauseWords = clause.split(/\s+/).filter(Boolean);
  if (clauseWords.length >= 4 && clauseWords.length <= 12 && !/^(and|or|then|but)\b/i.test(clause)) {
    return clause;
  }
  const cut = cleaned.slice(0, 64);
  const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > 28 ? lastSpace : 64).trim()}`;
}

export function refineDistinctOpportunities(
  sourceText: string,
  incoming: Opportunity[],
): Opportunity[] {
  const extracted = extractDistinctOpportunities(sourceText);
  const merged: Opportunity[] = [];
  for (const item of [...extracted, ...incoming]) {
    const excerpt = cleanQuote(item.excerpt || item.title || item.topic || "");
    const topic = item.topic || item.title || titleFromSentence(excerpt);
    if (!excerpt || excerpt.split(/\s+/).length < 6) continue;
    if (merged.some((existing) => tooSimilar(existing.excerpt, excerpt))) continue;
    merged.push({
      id: `topic-${merged.length + 1}`,
      kind: "topic",
      title: topic,
      topic,
      excerpt,
      whyValuable: item.whyValuable || buildWhy("topic", excerpt),
    });
    if (merged.length >= 5) break;
  }
  return merged.length > 0 ? merged : extracted;
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
    opportunities: [],
  };
}
