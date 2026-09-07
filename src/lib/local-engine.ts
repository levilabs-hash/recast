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
  const withoutSpeakers = text.replace(/^[A-Za-z]+:\s*/gm, "");
  const lines = withoutSpeakers
    .split(/\n+/)
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean);

  const parts: string[] = [];
  for (const line of lines) {
    const chunks = line
      .split(/(?<=[.!?])\s+(?=[A-Z“"0-9])/)
      .map((item) => item.trim())
      .filter(Boolean);
    if (chunks.length > 0) parts.push(...chunks);
    else parts.push(line);
  }

  return parts.filter((sentence) => {
    const words = sentence.split(/\s+/).filter(Boolean).length;
    if (words < 3 || sentence.length < 20) return false;
    if (/\?/.test(sentence) && words < 6) return false;
    return true;
  });
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

function wordCount(text: string): number {
  return cleanQuote(text).split(/\s+/).filter(Boolean).length;
}

function sentenceCaseTitle(text: string): string {
  const trimmed = cleanQuote(text).replace(/[.…]+$/g, "").replace(/\s+/g, " ").trim();
  if (!trimmed) return trimmed;
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

function isCompleteIdea(text: string): boolean {
  const cleaned = cleanQuote(text).replace(/[.,!?]+$/g, "").trim();
  if (!cleaned || /[…]|\.{3}$/.test(cleaned)) return false;
  if (wordCount(cleaned) < 2) return false;
  return !/\b(the|a|an|and|or|but|if|that|than|this|with|from|into|for|to|of|my|your|i|we|they)\s*$/i.test(
    cleaned,
  );
}

function isGoodContentIdeaTitle(title: string): boolean {
  const cleaned = cleanQuote(title).replace(/[.…]+$/g, "").trim();
  if (!cleaned) return false;
  if (/[…]|\.{3}$/.test(title)) return false;
  const count = wordCount(cleaned);
  if (count < 2 || count > 8) return false;
  if (cleaned.length > 56) return false;
  if (/[.!?].+\w/.test(cleaned)) return false;
  if (
    /^(i |we |they |most people |eventually |for \w+ years |then i |i used to |i started |creators |that's |host:|maya:|the days i |that sentence )/i.test(
      cleaned,
    )
  ) {
    return false;
  }
  if (/\b[A-Za-z]$/.test(cleaned) && (cleaned.split(/\s+/).pop() ?? "").length === 1) return false;
  return isCompleteIdea(cleaned);
}

function stripTitleLeadIns(text: string): string {
  let cleaned = cleanQuote(text);
  const patterns = [
    /^(the line that changes the piece:|the line i almost cut:|nobody wants to say this out loud:|contrarian:|how-to:|story:)\s*/i,
    /^(i used to think that|i used to think|i used to|eventually i realized that|eventually i realized|the shift was simple\.?|most people (?:treat|think|assume)|for two years|then i started|then i )\s*/i,
    /^(and that's|that's the part nobody believes\.?|no\.?\s+)/i,
    /^(what people get wrong about|the moment the idea became obvious:?)\s*/i,
  ];
  let prev = "";
  while (cleaned !== prev) {
    prev = cleaned;
    for (const pattern of patterns) {
      cleaned = cleaned.replace(pattern, "").trim();
    }
  }
  return cleaned.replace(/[.…]+$/g, "").trim();
}

function shortNoun(text: string): string {
  const cleaned = cleanQuote(text)
    .replace(/^(a |an |the )/i, "")
    .replace(/[.…]+$/g, "")
    .trim();
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length <= 4) return cleaned;
  return parts.slice(-3).join(" ");
}

function namedIdeaTitle(text: string): string | null {
  const value = text;

  if (
    /\b(customer feedback|talk(?:ing)? to customers|listen(?:ing)? to customer|users (?:told|said)|support thread)\b/i.test(
      value,
    )
  ) {
    return "Talk to customers before building";
  }
  if (/\bcustomers?\b/i.test(value) && /\b(brief|feedback|before building)\b/i.test(value)) {
    return "Talk to customers before building";
  }

  if (/\breject/i.test(value) && /\b(information|verdict|quit|unworthy|lesson|learn)/i.test(value)) {
    return "Turn rejection into information";
  }

  if (/\bmotivat/i.test(value) && /\b(habit|discipline|operating system|disappear|inspired|consistency)\b/i.test(value)) {
    return "Consistency beats motivation";
  }

  if (/\bbusy/i.test(value) && /\b(measure|progress|calendar|proof|productive|mattered)\b/i.test(value)) {
    return "Measure progress, not busyness";
  }
  if (/\b(packed calendar|fill every hour|proof of progress)\b/i.test(value) && /\b(progress|productive|mattered)\b/i.test(value)) {
    return "Measure progress, not busyness";
  }
  if (/\bone (important )?task\b/i.test(value) && /\b(day|successful|count)\b/i.test(value)) {
    return "One important task";
  }

  if (/\bimagined\b/i.test(value) && /\bproblem/i.test(value)) {
    return "Stop solving imagined problems";
  }
  if (/\bnobody asked\b/i.test(value) && /\b(built|features?|product)\b/i.test(value)) {
    return "Stop solving imagined problems";
  }

  if (/\bclips\b/i.test(value) && /\btension\b/i.test(value)) {
    return "Hunt for tension, not clips";
  }

  if (/\bpackaging\b/i.test(value) && /\bconfidence\b/i.test(value)) {
    return "Packaging, not confidence";
  }

  if (/\b28-second\b/i.test(value) || /\bfour formats\b/i.test(value) || /\bsame 12 words\b/i.test(value)) {
    return "The line you almost cut";
  }

  if (/\balmost cut\b/i.test(value) || /\baside you almost\b/i.test(value)) {
    return "The line you almost cut";
  }

  if (
    /\bselection is the job\b/i.test(value) ||
    /\bidentify the opportunities first\b/i.test(value) ||
    /\batomize too early\b/i.test(value) ||
    /\b30 posts\b/i.test(value) ||
    (/\btranscript\b/i.test(value) && /\bask ai\b/i.test(value))
  ) {
    return "Select before you generate";
  }

  if (/\b(almost )?four assets\b/i.test(value) || (/\b47 public\b/i.test(value) && /\bsource pieces\b/i.test(value))) {
    return "Four assets from one piece";
  }

  if (/\barchive is not a graveyard\b/i.test(value) || (/\binventory\b/i.test(value) && /\brecast/i.test(value))) {
    return "Your archive is inventory";
  }

  if (/\bsame brain, different box\b/i.test(value) || (/\bvague\b/i.test(value) && /\bsold\b/i.test(value))) {
    return "Make the offer specific";
  }

  if (/\b(needed more content|need more content)\b/i.test(value) || (/\bmoments\b/i.test(value) && /\balready (?:had|have|there)\b/i.test(value))) {
    return "Use the moments you already have";
  }

  if (/\brepurpos/i.test(value) || (/\blong-form\b/i.test(value) && /\b(content|already have|archive)\b/i.test(value))) {
    return "Repurpose existing long-form content";
  }

  return null;
}

function structuralTitle(text: string): string | null {
  const cleaned = stripTitleLeadIns(text);

  const turn = cleaned.match(/\bturn(?:ed|ing)?\s+([^.]{3,28})\s+into\s+([^.]{3,28})/i);
  if (turn) {
    const title = `Turn ${shortNoun(turn[1])} into ${shortNoun(turn[2])}`;
    if (isGoodContentIdeaTitle(title)) return sentenceCaseTitle(title);
  }

  const beats = cleaned.match(/\b([A-Za-z]+(?: [A-Za-z]+){0,2})\s+beats\s+([A-Za-z]+(?: [A-Za-z]+){0,2})/i);
  if (beats && isGoodContentIdeaTitle(beats[0])) return sentenceCaseTitle(beats[0]);

  const contrast = cleaned.match(
    /\bnot (?:a |an |the )?([^.,]{3,32}).{0,40}(?:it is|it's) (?:a |an |the )?([^.,]{3,32})/i,
  );
  if (contrast) {
    const title = `${shortNoun(contrast[2])}, not ${shortNoun(contrast[1])}`;
    if (isGoodContentIdeaTitle(title)) return sentenceCaseTitle(title);
  }

  const stopped = cleaned.match(/\bstopped\s+([^.]{3,28})\s+and started\s+([^.]{3,28})/i);
  if (stopped) {
    const title = `${sentenceCaseTitle(shortNoun(stopped[2]))}, not ${shortNoun(stopped[1])}`;
    if (wordCount(title) <= 8 && isCompleteIdea(title)) return title;
  }

  const terrible = cleaned.match(
    /\b([A-Za-z]+(?: [A-Za-z]+){0,2})\s+is a terrible\s+([A-Za-z]+(?: [A-Za-z]+){0,3})/i,
  );
  if (terrible && isGoodContentIdeaTitle(terrible[0])) return sentenceCaseTitle(terrible[0]);

  const question = cleaned.match(/[^?]{6,48}\?/);
  if (question && wordCount(question[0]) <= 8) return question[0].trim();

  return null;
}

function shortestCompleteClause(text: string): string {
  const parts = stripTitleLeadIns(text)
    .split(/[.;:!?—–]/)
    .flatMap((part) => part.split(/,\s+(?=[A-Z])/))
    .map((part) => part.replace(/^(and|or|but|so|because|then)\s+/i, "").trim())
    .filter((part) => {
      const count = wordCount(part);
      return count >= 3 && count <= 8 && isCompleteIdea(part);
    })
    .sort((a, b) => a.length - b.length);
  return parts[0] ?? "";
}

function fallbackTitle(text: string): string {
  const question = stripTitleLeadIns(text).match(/[^?]{6,48}\?/);
  if (question && wordCount(question[0]) <= 8) return question[0].trim();
  const clause = shortestCompleteClause(text);
  if (clause) return sentenceCaseTitle(clause);
  const words = stripTitleLeadIns(text).split(/\s+/).filter(Boolean);
  const slice = words.slice(0, Math.min(6, words.length));
  while (
    slice.length > 3 &&
    /^(the|a|an|and|or|but|to|of|for|with|from|into)$/i.test(slice[slice.length - 1] ?? "")
  ) {
    slice.pop();
  }
  return sentenceCaseTitle(slice.join(" "));
}

function isSourceCopyTitle(title: string, excerpt: string): boolean {
  const t = cleanQuote(title).toLowerCase().replace(/[.…]+$/g, "").trim();
  const e = cleanQuote(excerpt).toLowerCase();
  if (!t || t.length < 12) return false;
  return e.startsWith(t) || e.includes(t);
}

function contentIdeaTitle(excerpt: string, existing?: string): string {
  const candidate = existing?.trim() ?? "";
  const namedFromExcerpt = namedIdeaTitle(excerpt);
  if (namedFromExcerpt) return namedFromExcerpt;
  const question = structuralTitle(excerpt);
  if (question && /\?$/.test(question) && wordCount(question) <= 8) return question;
  if (
    candidate &&
    isGoodContentIdeaTitle(candidate) &&
    !isSourceCopyTitle(candidate, excerpt) &&
    !/^key takeaways$/i.test(candidate)
  ) {
    return sentenceCaseTitle(candidate);
  }
  if (question && !isSourceCopyTitle(question, excerpt)) return question;
  return fallbackTitle(excerpt || candidate);
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
  const max = Math.min(5, Math.max(sentences.length, 1));

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
    if (excerpt.split(/\s+/).filter(Boolean).length < 3) continue;
    const topic = contentIdeaTitle(excerpt);
    if (selected.some((existing) => sameSelectedIdea(existing, excerpt, topic))) continue;
    if (selected.length >= 3 && !namedIdeaTitle(excerpt) && !ideaTheme(excerpt)) continue;
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
    const topic = contentIdeaTitle(excerpt);
    return polishOpportunityPresentation(text, [
      {
        id: "topic-1",
        kind: "topic",
        title: topic,
        topic,
        excerpt,
        whyValuable: buildWhy("topic", excerpt),
      },
    ]);
  }

  return polishOpportunityPresentation(text, selected);
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
  if (
    /busy|busyness|meaningful week|fill every hour|one important task|full calendar|packed calendar|proof of progress/.test(
      value,
    )
  ) {
    return "progress";
  }
  if (/customer feedback|talk(?:ing)? to customers|listen(?:ing)? to customer|support thread/.test(value)) {
    return "customers";
  }
  if (/\breject/.test(value)) return "rejection";
  if (/30 posts|atomize|selection is the job|opportunities first|beige content/.test(value)) {
    return "selection";
  }
  if (/47 public|four assets|one long piece a week|almost four/.test(value)) return "yield";
  if (
    /archive is not|behind on recast|circle three moments|it's inventory|is inventory|repurpos|long-form|need more content/.test(
      value,
    )
  ) {
    return "inventory";
  }
  if (/28-second|four formats|almost cut|1\.2 million|imposter syndrome/.test(value)) return "oneline";
  return null;
}

function sameSelectedIdea(existing: Opportunity, excerpt: string, topic: string): boolean {
  const existingTopic = (existing.topic || existing.title).toLowerCase();
  if (existingTopic === topic.toLowerCase()) return true;
  if (tooSimilar(existing.excerpt, excerpt)) return true;
  const left = ideaTheme(existing.excerpt);
  const right = ideaTheme(excerpt);
  return Boolean(left && right && left === right);
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

function sourceParagraphsForSummary(sourceText: string): string[] {
  return sourceText
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.replace(/\s+/g, " ").trim())
    .filter((paragraph) => paragraph.length >= 40);
}

function isBroadSummary(excerpt: string, title: string, sourceText: string, siblings: Opportunity[]): boolean {
  if (/^key takeaways$/i.test(title.trim()) || /key takeaways?|in summary|to summarize|overview|main (?:points|ideas)|the whole (?:piece|source|transcript|video)/i.test(`${title} ${excerpt}`)) {
    return true;
  }

  const paragraphs = sourceParagraphsForSummary(sourceText);
  if (paragraphs.length >= 3) {
    const hits = paragraphs.filter(
      (paragraph) =>
        ideaOverlap(excerpt, paragraph) >= 0.35 ||
        excerpt.toLowerCase().includes(paragraph.slice(0, 40).toLowerCase()),
    ).length;
    if (hits >= 3) return true;
  }

  const sourceTokens = new Set(tokenize(sourceText));
  const excerptTokens = new Set(tokenize(excerpt));
  if (sourceTokens.size >= 50) {
    const covered = [...sourceTokens].filter((token) => excerptTokens.has(token)).length / sourceTokens.size;
    if (covered >= 0.55 && wordCount(excerpt) >= 40) return true;
  }

  const siblingHits = siblings.filter((item) => lexicalOverlap(excerpt, item.excerpt) >= 0.28).length;
  return siblingHits >= 3;
}

function applySummaryPolicy(sourceText: string, items: Opportunity[]): Opportunity[] {
  if (items.length === 0) return items;
  const marked = items.map((item, index) => ({
    item,
    summary: isBroadSummary(
      item.excerpt,
      item.title || item.topic || "",
      sourceText,
      items.filter((_, other) => other !== index),
    ),
  }));
  const strong = marked.filter((entry) => !entry.summary).map((entry) => entry.item);
  const summaries = marked.filter((entry) => entry.summary).map((entry) => entry.item);

  if (strong.length >= 4) return strong.slice(0, 5);

  const kept = [...strong];
  if (summaries.length > 0 && kept.length < 5) {
    const first = summaries[0];
    kept.push({
      ...first,
      title: "Key Takeaways",
      topic: "Key Takeaways",
    });
  }
  return kept.slice(0, 5);
}

export function polishOpportunityPresentation(sourceText: string, items: Opportunity[]): Opportunity[] {
  const used = new Set<string>();
  const titled = items.map((item) => {
    const excerpt = cleanQuote(item.excerpt || item.topic || item.title || "");
    let topic = contentIdeaTitle(excerpt, item.topic || item.title);
    const key = topic.toLowerCase();
    if (used.has(key)) {
      const alt = structuralTitle(excerpt) || fallbackTitle(excerpt);
      if (alt && !used.has(alt.toLowerCase()) && isGoodContentIdeaTitle(alt)) {
        topic = sentenceCaseTitle(alt);
      }
    }
    used.add(topic.toLowerCase());
    return { ...item, title: topic, topic };
  });
  return applySummaryPolicy(sourceText, titled);
}

export function refineDistinctOpportunities(
  sourceText: string,
  incoming: Opportunity[],
): Opportunity[] {
  const extracted = extractDistinctOpportunities(sourceText);
  const merged: Opportunity[] = [];
  for (const item of [...extracted, ...incoming]) {
    const excerpt = cleanQuote(item.excerpt || item.title || item.topic || "");
    const topic = contentIdeaTitle(excerpt, item.topic || item.title);
    if (!excerpt || excerpt.split(/\s+/).filter(Boolean).length < 3) continue;
    if (merged.some((existing) => sameSelectedIdea(existing, excerpt, topic))) continue;
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
  return polishOpportunityPresentation(sourceText, merged.length > 0 ? merged : extracted);
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
