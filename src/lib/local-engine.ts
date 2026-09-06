import type {
  AnalysisResult,
  GeneratedPiece,
  GenerationResult,
  Opportunity,
  OpportunityKind,
} from "./types";

const STOPWORDS = new Set(
  `a an the and or but if in on at to for of as is are was were be been being it this that those these with from by not no so than then just into over after before about up out your you we they i me my our their them there here what when where how why who which can could should would will may might must do does did doing have has had having too very more most other some any each few such own same than too only also still even because while during without within across per via etc vs plus like get got make made know known think thought want need use used using go going went come came see look take give put say said telling tell`.split(
    /\s+/,
  ),
);

const TENSION_PATTERNS: Array<{ test: RegExp; weight: number }> = [
  { test: /\d+(\.\d+)?%|\b\d{1,3}(,\d{3})+\b|\b\d+\s?(hours?|weeks?|days?|months?|million|thousand|k)\b/i, weight: 3 },
  { test: /\b(but|however|instead|actually|the truth|nobody|mistake|secret|wait|stop)\b/i, weight: 2.4 },
  { test: /\b(never|always|every|biggest|worst|best|brutal|useless|obvious)\b/i, weight: 1.4 },
  { test: /\?/, weight: 1.6 },
  { test: /\b(I|we|my|our)\b/, weight: 1.2 },
  { test: /["“].{12,}["”]/, weight: 1.8 },
  { test: /\b(rule|system|framework|question|packaging|inventory|operation)\b/i, weight: 1.3 },
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

function uniqueByTitle(items: Opportunity[]): Opportunity[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = item.title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function titleFromSentence(sentence: string, fallback: string): string {
  const clipped = sentence.replace(/^["“]|["”]$/g, "").trim();
  if (clipped.length <= 72) return clipped.replace(/[.]+$/, "");
  const cut = clipped.slice(0, 70);
  const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > 40 ? lastSpace : 70).trim()}…`;
}

function extractTopics(text: string): Array<{ title: string; excerpt: string; why: string }> {
  const words = tokenize(text);
  const counts = new Map<string, number>();
  const bigrams = new Map<string, number>();

  for (const word of words) {
    counts.set(word, (counts.get(word) ?? 0) + 1);
  }

  for (let i = 0; i < words.length - 1; i += 1) {
    const pair = `${words[i]} ${words[i + 1]}`;
    bigrams.set(pair, (bigrams.get(pair) ?? 0) + 1);
  }

  const phrases = [...bigrams.entries()]
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([phrase]) => phrase);

  const singles = [...counts.entries()]
    .filter(([, count]) => count >= 3)
    .sort((a, b) => b[1] - a[1])
    .map(([word]) => word)
    .filter((word) => !phrases.some((phrase) => phrase.includes(word)))
    .slice(0, 4);

  const sentences = splitSentences(text);
  const candidates = [...phrases, ...singles].slice(0, 4);

  return candidates.map((topic) => {
    const excerpt =
      sentences.find((sentence) => sentence.toLowerCase().includes(topic)) ??
      sentences[0] ??
      text.slice(0, 180);
    const repeats = (text.toLowerCase().match(new RegExp(topic.replace(/\s+/g, "\\s+"), "g")) ?? [])
      .length;
    return {
      title: topic.replace(/\b\w/g, (letter) => letter.toUpperCase()),
      excerpt,
      why: `This theme appears ${repeats} time${repeats === 1 ? "" : "s"} and can be recast across formats without losing the original point.`,
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
  const ranked = sentences
    .map((sentence, index) => ({ sentence, index, score: scoreSentence(sentence) }))
    .sort((a, b) => b.score - a.score);

  const topics = extractTopics(text).map((topic, index) => ({
    id: `topic-${index + 1}`,
    kind: "topic" as const,
    title: topic.title,
    excerpt: topic.excerpt,
    whyValuable: topic.why,
  }));

  const moments = ranked.slice(0, 4).map((item, index) => ({
    id: `moment-${index + 1}`,
    kind: "moment" as const,
    title: titleFromSentence(item.sentence, `High-value moment ${index + 1}`),
    excerpt: item.sentence,
    whyValuable: buildWhy("moment", item.sentence),
  }));

  const hookSeeds = ranked.filter((item) => item.score >= 3).slice(0, 3);
  const hooks = (hookSeeds.length > 0 ? hookSeeds : ranked.slice(0, 3)).map((item, index) => {
    const title = rewriteAsHook(item.sentence, index);
    return {
      id: `hook-${index + 1}`,
      kind: "hook" as const,
      title,
      excerpt: item.sentence,
      whyValuable: buildWhy("hook", item.sentence),
    };
  });

  const leadTopic = topics[0]?.title ?? "this idea";
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
      title: `How-to: recast ${leadTopic.toLowerCase()} into a repeatable system`,
      excerpt: sentences.find((sentence) => /\b(rule|system|how|stop|start|do not)\b/i.test(sentence)) ?? leadMoment,
      whyValuable:
        "How-to packaging is easier to buy and easier to save. It turns insight into an asset people come back to.",
    },
    {
      id: "angle-3",
      kind: "angle",
      title: "Story: the moment the idea became obvious",
      excerpt: sentences.find((sentence) => /\b(I|example|ago|used to)\b/.test(sentence)) ?? leadMoment,
      whyValuable:
        "A lived story carries more trust than advice. Short-form platforms still reward a scene with a turn.",
    },
  ];

  const opportunities = uniqueByTitle([...topics, ...moments, ...hooks, ...angles]).slice(0, 12);

  return { engine: "local", opportunities };
}

function rewriteAsHook(sentence: string, variant: number): string {
  const clean = sentence.replace(/^["“]|["”]$/g, "").replace(/\s+/g, " ").trim();
  const short = titleFromSentence(clean, clean);
  const patterns = [
    `Stop scrolling if this sounds familiar: ${short}`,
    `The line I almost cut: "${short}"`,
    `Nobody wants to hear this about ${firstNounPhrase(clean)}.`,
  ];
  return patterns[variant % patterns.length];
}

function firstNounPhrase(sentence: string): string {
  const words = tokenize(sentence).slice(0, 3);
  return words.length > 0 ? words.join(" ") : "your work";
}

function hashtagsFrom(opportunity: Opportunity, sourceText: string): string[] {
  const base = tokenize(`${opportunity.title} ${opportunity.excerpt}`)
    .slice(0, 5)
    .map((word) => word.replace(/-/g, ""));
  const extras = tokenize(sourceText).slice(0, 8);
  const merged = [...new Set([...base, ...extras, "contentops", "creators", "recast"])];
  return merged.slice(0, 8).map((tag) => `#${tag.replace(/\s+/g, "")}`);
}

function firstSentence(text: string): string {
  return splitSentences(text)[0] ?? text.slice(0, 140);
}

function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > 40 ? lastSpace : max - 1).trim()}…`;
}

function buildCta(opportunity: Opportunity): string {
  if (opportunity.kind === "angle" && /how-to/i.test(opportunity.title)) {
    return "Save this, then recast one long piece into three posts this week.";
  }
  if (opportunity.kind === "hook") {
    return "Reply with the line from your last video that you almost cut.";
  }
  return "Follow for more recasts from one source piece — and try this on your next transcript.";
}

export function generateLocally(
  sourceText: string,
  opportunities: Opportunity[],
): GenerationResult {
  const outputs: GeneratedPiece[] = opportunities.map((opportunity) => {
    const hook =
      opportunity.kind === "hook"
        ? opportunity.title
        : rewriteAsHook(opportunity.excerpt, opportunity.id.length);
    const cta = buildCta(opportunity);
    const claim = opportunity.excerpt.replace(/\s+/g, " ").trim();
    const why = opportunity.whyValuable;
    const hashtags = hashtagsFrom(opportunity, sourceText);

    const tiktokScript = [
      `HOOK (0-2s): ${hook}`,
      "",
      "ON SCREEN: talking head + keyword captions",
      `BEAT 1 (2-10s): ${clip(claim, 220)}`,
      `BEAT 2 (10-22s): Why this matters — ${clip(why, 180)}`,
      "BEAT 3 (22-32s): Give the viewer one move they can copy tonight. Keep the camera tight. Do not add a second idea.",
      `CTA (32-38s): ${cta}`,
    ].join("\n");

    const xPost = clip(
      `${hook}\n\n${clip(claim, 160)}\n\n${cta}`,
      280,
    );

    const instagramCaption = [
      hook,
      "",
      claim,
      "",
      why,
      "",
      cta,
      "",
      hashtags.join(" "),
    ].join("\n");

    const youtubeShortsTitle = clip(
      `${hook.replace(/^Stop scrolling if this sounds familiar:\s*/i, "")}`,
      70,
    );

    return {
      opportunityId: opportunity.id,
      opportunityTitle: opportunity.title,
      opportunityKind: opportunity.kind,
      tiktokScript,
      xPost,
      instagramCaption,
      youtubeShortsTitle,
      hook,
      cta,
      hashtags,
    };
  });

  return { engine: "local", outputs };
}

