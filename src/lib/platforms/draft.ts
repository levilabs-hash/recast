import type { Opportunity } from "@/lib/types";

const STOPWORDS = new Set(
  `a an the and or but if in on at to for of as is are was were be been being it this that those these with from by not no so than then just into over after before about up out your you we they i me my our their them there here what when where how why who which can could should would will may might must do does did doing have has had having too very more most other some any each few such own same only also still even because while during without within across per via etc vs plus like get got make made know known think thought want need use used using go going went come came see look take give put say said telling tell`.split(
    /\s+/,
  ),
);

const WEAK_WORDS = new Set([
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
  "same",
]);

export function cleanQuote(text: string): string {
  return text
    .replace(/[“”"']/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > 40 ? lastSpace : max - 1).trim()}…`;
}

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2 && !STOPWORDS.has(word) && !/^\d+$/.test(word));
}

export function sourceClaim(opportunity: Opportunity): string {
  return cleanQuote(opportunity.excerpt);
}

export function titleFromSentence(sentence: string): string {
  const clipped = cleanQuote(sentence).replace(/[.]+$/, "");
  if (clipped.length <= 72) return clipped;
  const cut = clipped.slice(0, 70);
  const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > 40 ? lastSpace : 70).trim()}…`;
}

export function draftHook(opportunity: Opportunity, variant = 0): string {
  if (opportunity.kind === "hook") return opportunity.title;
  const short = titleFromSentence(opportunity.excerpt);
  const patterns = [
    short.endsWith("?") ? short : `The line that changes the piece: ${short}`,
    `The line I almost cut: ${short}`,
    `Nobody wants to say this out loud: ${short}`,
  ];
  return patterns[variant % patterns.length];
}

export function draftCta(opportunity: Opportunity): string {
  if (opportunity.kind === "angle" && /how-to/i.test(opportunity.title)) {
    return "Save this, then recast one long piece into three posts this week.";
  }
  if (opportunity.kind === "hook" || /\?/.test(opportunity.excerpt)) {
    return "Reply with the line from your last video that you almost cut.";
  }
  return "Follow for more recasts from one source piece — and try this on your next transcript.";
}

export function draftHashtags(opportunity: Opportunity, sourceText: string): string[] {
  const base = tokenize(`${opportunity.title} ${opportunity.excerpt}`)
    .filter((word) => !WEAK_WORDS.has(word))
    .slice(0, 5)
    .map((word) => word.replace(/-/g, ""));
  const extras = tokenize(sourceText)
    .filter((word) => !WEAK_WORDS.has(word) && word.length > 4)
    .slice(0, 8);
  const merged = [...new Set([...base, ...extras, "contentops", "creators", "recast"])];
  return merged.slice(0, 8).map((tag) => `#${tag.replace(/\s+/g, "")}`);
}

export function sourceClauses(text: string): string[] {
  return cleanQuote(text)
    .split(/(?<=[.!?])\s+|(?<=[;:—–-])\s+/)
    .map((part) => part.trim())
    .filter((part) => part.length >= 12);
}

export function onScreenSuggestions(opportunity: Opportunity): string {
  const claim = sourceClaim(opportunity);
  const lines = sourceClauses(claim)
    .map((line) => clip(line.replace(/[.]+$/, ""), 42))
    .filter((line) => line.length >= 8)
    .slice(0, 4);

  const fallback = lines.length > 0 ? lines : [clip(claim, 42)];
  return fallback.map((line, index) => `${index + 1}. ${line}`).join("\n");
}

export function textKey(text: string): string {
  return cleanQuote(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function overlaps(a: string, b: string): boolean {
  const left = textKey(a);
  const right = textKey(b);
  if (!left || !right) return false;
  if (left === right) return true;
  const shorter = left.length <= right.length ? left : right;
  const longer = left.length <= right.length ? right : left;
  return shorter.length >= 18 && longer.includes(shorter);
}

function stripHookPrefix(text: string): string {
  return cleanQuote(text)
    .replace(
      /^(The line that changes the piece:|The line I almost cut:|Nobody wants to say this out loud:|Stop scrolling if this sounds familiar:)\s*/i,
      "",
    )
    .replace(/[.]+$/, "")
    .trim();
}

export function attentionHook(opportunity: Opportunity): string {
  const claim = sourceClaim(opportunity);
  const title = stripHookPrefix(opportunity.title);

  const contrast = claim.match(
    /\bnot (?:a |an |the )?([^.,]+?)\.\s*(?:It is|It's|it is) (?:a |an |the )?([^.,]+)/i,
  );
  if (contrast) {
    return `It's not ${contrast[1].trim()}. It's ${contrast[2].trim()}.`;
  }

  const stopped = claim.match(/\bstopped (.+?) and started (.+?)(?:\.|$)/i);
  if (stopped) {
    return `Stop ${stopped[1].trim()}.`;
  }

  const questionAndJudgment = claim.match(/^(.+\?)\s+(.+)$/);
  if (questionAndJudgment) {
    const judgment = stripHookPrefix(questionAndJudgment[2]);
    if (judgment.length > 0 && judgment.length <= 48) return judgment;
    return clip(questionAndJudgment[1], 56);
  }

  if (title.length >= 8 && title.length <= 56 && !overlaps(title, claim)) {
    return title;
  }

  const clauses = sourceClauses(claim);
  if (clauses.length >= 2) {
    const shortest = [...clauses].sort((a, b) => a.length - b.length)[0];
    return clip(stripHookPrefix(shortest), 56);
  }

  const trailing = stripHookPrefix(claim).split(/[.!?]/).map((part) => part.trim()).filter(Boolean);
  if (trailing.length >= 2 && trailing[trailing.length - 1].split(/\s+/).length <= 4) {
    return trailing[trailing.length - 1];
  }

  const words = stripHookPrefix(claim).split(/\s+/);
  if (words.length > 12) {
    return words.slice(0, 7).join(" ");
  }
  if (title.length >= 8 && title.length <= 40) {
    return title;
  }
  return clip(stripHookPrefix(claim), 48);
}

export function expandFromSource(opportunity: Opportunity, hook: string): string {
  const claim = sourceClaim(opportunity);
  const unused = sourceClauses(claim).find((clause) => !overlaps(hook, clause));
  if (unused) {
    return unused;
  }
  if (!overlaps(hook, claim)) {
    return `The source puts it this way: ${claim}`;
  }
  const title = stripHookPrefix(opportunity.title);
  if (title && !overlaps(hook, title) && !overlaps(title, claim)) {
    return `The reusable moment is ${title}: ${claim}`;
  }
  return `Don't leave this buried in the long piece. The source says: ${claim}`;
}

export function insightFromSource(opportunity: Opportunity): string {
  return opportunity.whyValuable;
}

export function takeawayFromSource(opportunity: Opportunity, hook: string, beat1: string): string {
  const claim = sourceClaim(opportunity);
  if (/\bstopped\b.+\bstarted\b/i.test(claim)) {
    const match = claim.match(/\bstarted (.+?)(?:\.|$)/i);
    return match
      ? `Use that shift. Start ${match[1].trim()}, and recast that moment instead of the whole cut.`
      : "Publish the turn in the source — the start, not the setup.";
  }
  if (/\bnot\b.+\b(it is|it's)\b/i.test(claim)) {
    return "Post the reframe. Keep the contrast the source already made; do not add a second idea.";
  }
  if (/\?/.test(claim)) {
    return "Treat the question as the clip. Put it on screen and let the rest of the piece stay long-form.";
  }
  if (/\d/.test(claim)) {
    return "Lead with the number the source already gave. That is the reusable beat.";
  }
  if (/how-to/i.test(opportunity.title) || /\brule\b/i.test(claim)) {
    return `Make the next move the source names: ${clip(claim, 140)}`;
  }
  const unusedClause = sourceClauses(claim).find(
    (part) => !overlaps(part, hook) && !overlaps(part, beat1),
  );
  if (unusedClause) {
    return `Circle this and recast it tonight: ${clip(unusedClause, 140)}`;
  }
  return "Publish this one moment. Do not recast a second idea the source did not give you.";
}

export function captionSnippets(opportunity: Opportunity, hook: string): string {
  return videoCaptions(opportunity, hook);
}

function similarCaption(a: string, b: string): boolean {
  const left = textKey(a).split(" ").filter(Boolean);
  const right = textKey(b).split(" ").filter(Boolean);
  if (left.length === 0 || right.length === 0) return false;
  const set = new Set(left);
  const shared = right.filter((word) => set.has(word)).length;
  return shared / Math.max(left.length, right.length) >= 0.75;
}

function tooCloseToHook(caption: string, hook: string): boolean {
  const a = textKey(caption);
  const b = textKey(hook);
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.startsWith(b) && a.length - b.length < 12) return true;
  if (b.startsWith(a) && b.length - a.length < 8) return true;
  return false;
}

export function videoCaptions(opportunity: Opportunity, hook: string): string {
  const claim = sourceClaim(opportunity);
  const captions: string[] = [];
  const seen = new Set<string>();

  function add(raw: string) {
    const trimmed = stripHookPrefix(raw).replace(/\s+/g, " ").trim();
    const isQuestion = /\?/.test(trimmed);
    const caption = `${trimmed.replace(/[.?]+$/g, "").trim()}${isQuestion ? "?" : ""}`;
    if (caption.replace(/\?$/, "").length < 12 || caption.length > 88) return;
    const words = caption.split(/\s+/);
    if (words.length < 3 || words.length > 14) return;
    if (tooCloseToHook(caption, hook)) return;
    const key = textKey(caption);
    if (seen.has(key)) return;
    if (captions.some((existing) => similarCaption(existing, caption))) return;
    seen.add(key);
    captions.push(caption);
  }

  const stopped = claim.match(/\bstopped (.+?) and started (.+?)(?:\.|$)/i);
  if (stopped) {
    const from = stopped[1].trim();
    const to = stopped[2].trim();
    add(`Stop ${from}. Start ${to}.`);
    add(`${to.charAt(0).toUpperCase()}${to.slice(1)}, not just ${from}.`);
    add(`Hunt for ${to.replace(/^hunting for\s+/i, "")}, not just ${from.replace(/^hunting for\s+/i, "")}.`);
  }

  const contrast = claim.match(
    /\bnot (?:a |an |the )?([^.,]+?)\.\s*(?:It is|It's|it is) (?:a |an |the )?([^.,]+)/i,
  );
  if (contrast) {
    add(`Not ${contrast[1].trim()}. ${contrast[2].trim().replace(/^\w/, (letter) => letter.toUpperCase())}.`);
    add(`It's ${contrast[2].trim()}, not ${contrast[1].trim()}.`);
  }

  const questionAndJudgment = claim.match(/^(.+\?)\s+(.+)$/);
  if (questionAndJudgment) {
    const question = questionAndJudgment[1].trim();
    const judgment = stripHookPrefix(questionAndJudgment[2]);
    add(`${judgment}: ${question}`);
    add(question);
  }

  const grew = claim.match(
    /\bgrew (.+?) into (?:a |an |the )?(.+?)(?:\s+without|\s+by |\.|$)/i,
  );
  if (grew) {
    add(`Grew ${grew[1].trim()} into ${grew[2].trim()}.`);
    add(`A ${grew[1].trim()}. Then ${grew[2].trim()}.`);
  }

  const usedTo = claim.match(/\bused to (.+?)(?:\.|$)/i);
  if (usedTo) {
    add(`Used to ${usedTo[1].trim()}.`);
    if (/\bVague\b/i.test(claim)) add(`Used to ${usedTo[1].trim()}. Vague.`);
  }

  const sold = claim.match(/\bsold\s+(.+?)(?:\.|$)/i);
  if (sold) {
    add(`Sold ${sold[1].trim()}.`);
  }

  for (const match of claim.matchAll(
    /(?:an? )?X post that did [\d,.]+ million impressions/gi,
  )) {
    add(match[0]);
  }
  for (const match of claim.matchAll(/\b\d+-second [A-Za-z]+/g)) {
    add(`A ${match[0]}.`);
  }
  const titled = claim.match(/titled\s+([^,]+)/i);
  if (titled) add(titled[1].trim());

  for (const clause of sourceClauses(claim)) {
    if (captions.length >= 4) break;
    const cleaned = stripHookPrefix(clause);
    if (similarCaption(cleaned, claim) && captions.length >= 2) continue;
    const count = cleaned.split(/\s+/).length;
    if (count >= 5 && count <= 14) add(cleaned);
  }

  if (captions.length < 2) {
    const pieces = claim
      .split(/,\s+/)
      .map((part) => stripHookPrefix(part))
      .filter((part) => part.split(/\s+/).length >= 4 && part.split(/\s+/).length <= 12);
    for (const part of pieces) add(part);
  }

  for (const sentence of claim.split(/(?<=[.!?])\s+/)) {
    const cleaned = stripHookPrefix(sentence);
    const count = cleaned.split(/\s+/).length;
    if (count >= 3 && count <= 8) add(cleaned);
  }

  if (captions.length < 2 && claim.split(/\s+/).length >= 5 && claim.split(/\s+/).length <= 16) {
    add(claim);
  }

  if (captions.length < 2) {
    const title = stripHookPrefix(opportunity.title);
    if (title.split(/\s+/).length >= 3) add(`The reusable moment: ${title}`);
  }

  const lines = captions.slice(0, 4);
  const fallback = lines.length > 0 ? lines : [clip(stripHookPrefix(claim), 64)];
  return fallback.map((line, index) => {
    const readable = line.charAt(0).toUpperCase() + line.slice(1);
    return `${index + 1}. ${readable}`;
  }).join("\n");
}

export function specificCta(opportunity: Opportunity, hook: string): string {
  const claim = sourceClaim(opportunity);
  const why = opportunity.whyValuable;

  const stopped = claim.match(/\bstopped (.+?) and started (.+?)(?:\.|$)/i);
  if (stopped) {
    return `On your next transcript, start ${stopped[2].trim()} instead of ${stopped[1].trim()}.`;
  }
  const contrast = claim.match(
    /\bnot (?:a |an |the )?([^.,]+?)\.\s*(?:It is|It's|it is) (?:a |an |the )?([^.,]+)/i,
  );
  if (contrast) {
    return `Before you post, recast the problem as ${contrast[2].trim()}, not ${contrast[1].trim()}.`;
  }
  if (/\?/.test(claim) || /\?/.test(hook)) {
    const question = (claim.match(/[^?]+\?/) ?? [hook])[0];
    return `Reply with a better question than: ${clip(question, 56)}`;
  }
  const number = claim.match(/\$[\d,.]+|\d+(?:\.\d+)?%|\b\d+\s?(?:hours?|weeks?|days?|months?|million)\b/i);
  if (number) {
    return `Open your next post with ${number[0]} from this moment.`;
  }
  if (/how-to|system|rule/i.test(`${opportunity.title} ${claim}`)) {
    return `Save this, then run the source's move on your next long piece.`;
  }
  if (why && !/^This theme is load-bearing/i.test(why)) {
    return `Use this insight on your next recast: ${clip(stripHookPrefix(why), 56)}`;
  }
  return `Recast this moment from the source: ${clip(claim, 48).replace(/[.]+$/, "")}.`;
}
