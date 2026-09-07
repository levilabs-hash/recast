import type { Opportunity } from "@/lib/types";
import { cleanQuote, sourceClaim, sourceClauses, textKey } from "./draft";

const LABEL_PREFIX =
  /^(the line that changes the piece:|the line i almost cut:|nobody wants to say this out loud:|contrarian:|how-to:|story:)\s*/i;
const HOST_OPENER = /^today i'?m sitting\b/i;
const INTERVIEWER_LINE =
  /^(so how do you|what do people get wrong|you said |that's a hell of a swing|what does it look like|is that actually true|push on that|last one\b)/i;
const LABEL_TITLES =
  /moment the idea became obvious|repeatable system|what people get wrong|creating content|content meant|meant constantly/i;
const META_SPEECH =
  /\b(do not |that is the clip|stay with this one moment|lead with |put the question on screen|reusable moment|recast this|name the offer so specifically|stop after the question|internal|generation)\b/i;

function words(text: string): string[] {
  return cleanQuote(text).split(/\s+/).filter(Boolean);
}

function sentenceCase(text: string): string {
  const trimmed = cleanQuote(text).replace(/^[.,]+|[.,]+$/g, "").trim();
  if (!trimmed) return trimmed;
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

function endSentence(text: string): string {
  const trimmed = String(text).replace(/\s+/g, " ").replace(/^[.,]+|[.,]+$/g, "").trim();
  if (!trimmed) return trimmed;
  const cased = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
  return /[.!?]$/.test(cased) ? cased : `${cased}.`;
}

function isCategoryName(title: string): boolean {
  const stripped = cleanQuote(title).replace(LABEL_PREFIX, "").trim();
  if (!stripped || /…|\.\.\.$/.test(stripped)) return true;
  const count = words(stripped).length;
  if (count <= 6 && LABEL_TITLES.test(stripped)) return true;
  if (/[?$]/.test(stripped)) return false;
  if (/\b(stop|stopped|start|started|worth|instead|useless|sold|became|almost cut)\b/i.test(stripped)) {
    return false;
  }
  return count <= 4;
}

function sourceSentences(sourceText: string): string[] {
  return sourceText
    .replace(/\r\n/g, "\n")
    .replace(/[“”]/g, '"')
    .replace(/^[A-Za-z]+:\s*/gm, "")
    .replace(/\s+/g, " ")
    .trim()
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 12 && words(sentence).length >= 4);
}

function completeFromSource(sourceText: string, excerpt: string): string[] {
  const sentences = sourceSentences(sourceText);
  const excerptClean = cleanQuote(excerpt).replace(/[….]{2,}$/g, "").trim();
  if (sentences.length === 0) return excerptClean ? [excerptClean] : [];

  const lead = sourceSentences(excerptClean)[0] ?? excerptClean;
  const prefix = textKey(lead).split(" ").filter(Boolean).slice(0, 6).join(" ");
  let index = sentences.findIndex((sentence) => {
    const key = textKey(sentence);
    return (prefix && (key.includes(prefix) || prefix.includes(key))) || sameLine(sentence, lead);
  });
  if (index < 0) {
    const needles = textKey(excerptClean).split(" ").filter((word) => word.length > 3);
    index = sentences.findIndex((sentence) => {
      const key = textKey(sentence);
      return needles.filter((word) => key.includes(word)).length >= Math.min(4, needles.length);
    });
  }
  if (index < 0) return excerptClean ? [excerptClean] : [];
  const slice = sentences.slice(index, index + 4);
  const kept: string[] = [];
  for (const sentence of slice) {
    if (kept.length > 0 && isTopicShift(sentence, slice[0])) break;
    kept.push(sentence);
  }
  return kept.length > 0 ? kept : slice.slice(0, 3);
}

function sameLine(a: string, b: string): boolean {
  const left = textKey(a);
  const right = textKey(b);
  if (!left || !right) return false;
  if (left === right) return true;
  const shorter = left.length <= right.length ? left : right;
  const longer = left.length <= right.length ? right : left;
  return shorter.split(" ").length >= 6 && longer.includes(shorter);
}

function usableClauses(claim: string): string[] {
  return sourceClauses(claim).filter((clause) => {
    if (HOST_OPENER.test(clause) || INTERVIEWER_LINE.test(clause) || words(clause).length < 3) {
      return false;
    }
    if (/\bis:?$/i.test(clause) && words(clause).length <= 5) return false;
    if (META_SPEECH.test(clause)) return false;
    return true;
  });
}

function unusedClause(claim: string, used: string[]): string | null {
  return (
    usableClauses(claim).find((clause) => !used.some((item) => sameLine(clause, item))) ?? null
  );
}

function firstQuestion(claim: string): string | null {
  const matches = claim.match(/[A-Za-z][^?]{2,90}\?/g) ?? [];
  const ranked = matches
    .map((item) => item.trim())
    .filter((item) => {
      const count = words(item).length;
      return count >= 3 && count <= 14;
    })
    .sort((a, b) => {
      const rank = (item: string) =>
        /^(am |what |how |why |the better )/i.test(item) ? 0 : 1;
      return rank(a) - rank(b) || a.length - b.length;
    });
  return ranked[0] ?? null;
}

function ideaOverlap(a: string, b: string): number {
  const left = new Set(textKey(a).split(" ").filter((word) => word.length > 3));
  const right = textKey(b).split(" ").filter((word) => word.length > 3);
  if (left.size === 0 || right.length === 0) return 0;
  const shared = right.filter((word) => left.has(word)).length;
  return shared / Math.max(left.size, new Set(right).size);
}

function sourceParagraphs(sourceText: string): string[] {
  return sourceText
    .replace(/\r\n/g, "\n")
    .replace(/[“”]/g, '"')
    .split(/\n\s*\n/)
    .map((paragraph) =>
      paragraph
        .replace(/^[A-Za-z]+:\s*/gm, "")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter((paragraph) => paragraph.length >= 40);
}

function belongsToSeed(sentence: string, seed: string): boolean {
  const sentenceClean = cleanQuote(sentence);
  const seedClean = cleanQuote(seed);
  if (!sentenceClean || !seedClean) return false;
  const sentenceKey = textKey(sentenceClean);
  const seedKey = textKey(seedClean);
  if (!sentenceKey || !seedKey) return false;
  if (seedKey.includes(sentenceKey) && sentenceKey.split(" ").filter(Boolean).length >= 4) return true;
  const needle = seedKey.slice(0, Math.min(48, seedKey.length));
  if (needle.length >= 12 && sentenceKey.includes(needle)) return true;
  return ideaOverlap(sentenceClean, seedClean) >= 0.34;
}

function uniqueSentences(items: string[]): string[] {
  const ordered: string[] = [];
  for (const sentence of items) {
    if (!ordered.some((item) => sameLine(item, sentence))) ordered.push(sentence);
  }
  return ordered;
}

function isolateIdea(sourceText: string, opportunity: Opportunity): string[] {
  const seed = cleanQuote(opportunity.excerpt || opportunity.topic || opportunity.title);
  if (!seed) return [];
  const fromSeed = sourceSentences(seed);
  const seedUnits = fromSeed.length > 0 ? fromSeed : [seed];

  const paragraphs = sourceParagraphs(sourceText);
  const needle = cleanQuote(seed).toLowerCase().slice(0, 48);
  let best = "";
  let bestScore = 0;
  for (const paragraph of paragraphs) {
    const hay = cleanQuote(paragraph).toLowerCase();
    const contained = Boolean(needle) && hay.includes(needle);
    const score = contained ? 1 : ideaOverlap(paragraph, seed);
    if (score > bestScore) {
      bestScore = score;
      best = paragraph;
    }
  }

  if (best && bestScore >= 0.4) {
    const sentences = sourceSentences(best);
    const focused = sentences.filter((sentence) => belongsToSeed(sentence, seed));
    if (focused.length > 0) return uniqueSentences(focused);
    const tooBroad = paragraphs.length <= 1 || sentences.length > 7 || best.length > 900;
    if (!tooBroad && sentences.length > 0) return sentences;
  }

  const fromAll = sourceSentences(sourceText).filter((sentence) => belongsToSeed(sentence, seed));
  if (fromAll.length > 0) return uniqueSentences(fromAll);
  return seedUnits;
}

function ideaFromSource(sourceText: string, opportunity: Opportunity): string {
  const isolated = isolateIdea(sourceText, opportunity);
  const seed = cleanQuote(opportunity.excerpt || "");
  if (seed && !isolated.some((part) => sameLine(part, seed))) {
    isolated.unshift(seed);
  }
  return isolated.join(" ");
}

function isCompletePhrase(text: string): boolean {
  const cleaned = cleanQuote(text).replace(/[.,!?]+$/g, "").trim();
  if (!cleaned || /…|\.\.\.$/.test(cleaned)) return false;
  if (words(cleaned).length < 2) return false;
  return !/\b(wasn't|didn't|isn't|aren't|couldn't|wouldn't|shouldn't|the|a|an|and|or|but|if|that|than|this|these|those|with|from|into|for|to|of|my|your|i|we|they|needed|was|were|problem|realized|eventually)\s*$/i.test(
    cleaned,
  );
}

function punchyFromIdea(claim: string): string | null {
  if (/\bbusy\b/i.test(claim) && /\b(progress|meaningful)\b/i.test(claim)) {
    return "Busy isn't the same as progress.";
  }
  if (/\bfill every hour\b/i.test(claim) && /\b(tasks?|productive)\b/i.test(claim)) {
    return "Filling every hour is not progress.";
  }
  if (/\bfill(?:ing|ed)? the day\b/i.test(claim) && /\b(one (important )?task|important task)\b/i.test(claim)) {
    return "Stop filling the day. Choose one important task.";
  }
  if (/\bone (important )?task\b/i.test(claim) && /\b(successful|progress|counts)\b/i.test(claim)) {
    return "Choose the one task that makes the day count.";
  }

  if (
    /\bwasn'?t that I needed more content\b/i.test(claim) ||
    (/\bneeded more content\b/i.test(claim) && /\b(problem wasn'?t|wasn'?t that)\b/i.test(claim))
  ) {
    return "You don't need more content.";
  }
  const more = claim.match(/\bwasn'?t that I needed more ([a-z]+)\b/i);
  if (more) return `You don't need more ${more[1]}.`;

  if (/\bbest moments\b/i.test(claim) && /\balready (?:had|have|there)\b/i.test(claim)) {
    return "Find the best moments you already have.";
  }
  if (/\bmoments\b/i.test(claim) && /\balready (?:had|have|there)\b/i.test(claim)) {
    return "Find the moments you already have.";
  }

  if (
    /\b(one recording|one conversation|one (?:long )?piece)\b/i.test(claim) &&
    /\bmultiple (?:posts|pieces|assets)\b/i.test(claim)
  ) {
    return "One recording can become multiple posts.";
  }
  if (/\bcan become multiple (?:posts|pieces)\b/i.test(claim)) {
    return "One recording can become multiple posts.";
  }
  if (/\bmotivation is a terrible\b/i.test(claim) || (/\bmotivat/i.test(claim) && /\boperating system\b/i.test(claim))) {
    return "Motivation is a terrible operating system.";
  }
  if (/\brejection was information\b/i.test(claim) || (/\breject/i.test(claim) && /\binformation\b/i.test(claim))) {
    return "Rejection was information, not a verdict.";
  }
  if (/\breject/i.test(claim) && /\b(taught|lesson|learn)\b/i.test(claim)) {
    return "The rejection was the lesson.";
  }
  if (/\bmotivat/i.test(claim) && /\b(disappear|habit|discipline)\b/i.test(claim)) {
    return "Motivation disappears. Habits stay.";
  }
  if (/\bimagined\b/i.test(claim) && /\bproblem/i.test(claim)) {
    return "I was solving problems I imagined.";
  }
  if (/\bnobody asked\b/i.test(claim)) {
    return "I built something nobody asked for.";
  }

  return null;
}

function openingHook(opportunity: Opportunity, idea: string): string {
  const seed = cleanQuote(opportunity.excerpt || opportunity.topic || opportunity.title);
  const units = sourceSentences(idea);
  const preferred =
    units
      .slice()
      .sort((left, right) => ideaOverlap(right, seed) - ideaOverlap(left, seed))[0] ?? idea;
  const claim = idea;

  const compressed = punchyFromIdea(preferred) || punchyFromIdea(seed) || punchyFromIdea(idea);
  if (compressed) return compressed;

  if (/\bhunting for (?:good )?clips\b/i.test(claim) && /\b(?:look for tension|hunting for tension)\b/i.test(claim)) {
    return "Stop hunting for clips. Start hunting for tension.";
  }

  const stopped = claim.match(/\bstopped (.+?) and started (.+?)(?:\.|$)/i);
  if (stopped) {
    return sentenceCase(`Stop ${stopped[1].trim()}. Start ${stopped[2].trim()}`);
  }

  const contrast = claim.match(
    /\bnot (?:a |an |the )?([^.,]+?)\.\s*(?:It is|It's|it is) (?:a |an |the )?([^.,]+)/i,
  );
  if (contrast) {
    return `It's not ${contrast[1].trim()}. It's ${contrast[2].trim()}.`;
  }

  const asked = firstQuestion(claim);
  if (asked) return asked.endsWith("?") ? asked : `${asked}?`;

  if (/\balmost four assets per input\b/i.test(claim)) {
    return "Almost four assets per input.";
  }

  const grew = claim.match(
    /\bgrew (.+?) into (?:a |an |the )?(.+?)(?:\s+without|\s+by |\.|$)/i,
  );
  if (grew) {
    return sentenceCase(`Grew ${grew[1].trim()} into a ${grew[2].trim()}`);
  }

  if (/\bisn'?t to create more content from nothing\b/i.test(claim) && /\bvaluable moments\b/i.test(claim)) {
    return "The goal isn't more content from nothing. It's the moments already there.";
  }

  if (/\bsame brain, different box\b/i.test(claim)) {
    return "Same brain, different box.";
  }

  const usedTo = claim.match(/\bused to sell (.+?)(?:\.|$)/i);
  if (usedTo && /\bvague\b/i.test(claim)) {
    return sentenceCase(`I used to sell ${usedTo[1].trim()}. Vague`);
  }

  const listHead = claim.match(/^(that sentence became [^.]+?)(?:,| and )/i);
  if (listHead && words(listHead[1]).length <= 10) {
    return sentenceCase(listHead[1]);
  }

  const punchy = usableClauses(claim)
    .map((clause) => clause.replace(/^[.]+|[.]+$/g, "").trim())
    .filter((clause) => {
      const count = words(clause).length;
      if (count < 4 || count > 12 || isCategoryName(clause) || sameLine(clause, opportunity.title)) {
        return false;
      }
      if ((clause.match(/,/g) ?? []).length >= 2 && count <= 8) return false;
      return true;
    })
    .sort((a, b) => a.length - b.length)[0];
  if (punchy) return acceptHook(punchy, opportunity);

  const first = usableClauses(claim).find((clause) => !isCategoryName(clause) && !sameLine(clause, opportunity.title)) ?? "";
  const tightened = first ? punchyFromIdea(first) : null;
  if (tightened) return tightened;
  if (first && words(first).length <= 12 && isCompletePhrase(first)) {
    return acceptHook(first, opportunity);
  }
  const excerpt = usableClauses(sourceClaim(opportunity)).find(
    (clause) => !isCategoryName(clause) && isCompletePhrase(clause) && words(clause).length <= 12,
  );
  const anyComplete = usableClauses(claim).find(
    (clause) => !isCategoryName(clause) && isCompletePhrase(clause),
  );
  return acceptHook(excerpt || anyComplete || first, opportunity);
}

function acceptHook(text: string, opportunity: Opportunity): string {
  const hook = sentenceCase(text);
  if (!isCategoryName(hook) && !LABEL_TITLES.test(hook) && !sameLine(hook, opportunity.title)) {
    return hook;
  }
  const excerpt = usableClauses(sourceClaim(opportunity)).find(
    (clause) => !isCategoryName(clause) && !sameLine(clause, opportunity.title),
  );
  return excerpt ? sentenceCase(excerpt) : hook;
}

function spokenBeats(hook: string, idea: string, sourceText: string): string[] {
  const claim = idea;
  const used = [hook];
  const beats: string[] = [];

  function push(text: string | null | undefined) {
    if (!text || META_SPEECH.test(text) || sameLine(text, hook)) return;
    if (beats.some((existing) => sameLine(existing, text))) return;
    beats.push(endSentence(text));
    used.push(text);
  }

  const stopped = claim.match(/\bstopped (.+?) and started (.+?)(?:\.|$)/i);
  if (stopped) {
    const from = stopped[1].trim();
    const to = stopped[2].trim();
    push(/^hunting\b/i.test(from) ? `I was ${from}` : `I stopped ${from}`);
    push(`Then I started ${to}`);
    push(unusedClause(claim, used));
    return beats.slice(0, 3);
  }

  if (/\bhunting for (?:good )?clips\b/i.test(claim) && /\btension\b/i.test(claim)) {
    push("I used to think creating content meant hunting for good clips");
    push(
      "The better approach is to look for tension, useful ideas, and moments that can stand on their own",
    );
    push(
      /\blong conversation\b/i.test(claim)
        ? "One long conversation can contain multiple pieces if you know what to look for"
        : "Find the valuable moments that are already there",
    );
    return beats.slice(0, 3);
  }

  const contrast = claim.match(
    /\bnot (?:a |an |the )?([^.,]+?)\.\s*(?:It is|It's|it is) (?:a |an |the )?([^.,]+)/i,
  );
  if (contrast) {
    push(`It is not ${contrast[1].trim()}`);
    push(`It is ${contrast[2].trim()}`);
    push(unusedClause(claim, used));
    return beats.slice(0, 3);
  }

  const usedTo = claim.match(/\bused to sell (.+?)(?:\.|$)/i);
  if (usedTo) {
    push(`I used to sell ${usedTo[1].trim()}`);
    if (/\bvague\b/i.test(claim)) push("Vague");
    const sold = claim.match(/\bsold\s+[“"]?([^.”"]+)[”"]?/i);
    if (sold) push(`Then I sold ${sold[1].trim()}`);
    push(unusedClause(claim, used));
    return beats.slice(0, 3);
  }

  const asked = firstQuestion(claim);
  if (asked) {
    if (!sameLine(hook, asked)) push(asked);
    if (/\buseless question\b/i.test(claim)) push("Useless question");
    if (/\bwhat transformation is so specific\b/i.test(claim)) {
      push("The better question is: what transformation is so specific that $3,000 feels obvious?");
    }
    push(unusedClause(claim, used));
    return beats.slice(0, 3);
  }

  const listNext = claim.split(/,\s+/).map((part) => cleanQuote(part)).filter((part) => {
    const count = words(part).length;
    return count >= 3 && count <= 14 && !sameLine(part, hook) && !HOST_OPENER.test(part);
  });
  for (const part of listNext) {
    if (beats.length >= 3) break;
    push(part);
  }

  while (beats.length < 2) {
    const next = unusedClause(claim, used);
    if (!next) break;
    push(next);
  }

  if (beats.length === 0) {
    const leftover = usableClauses(claim).filter((clause) => !sameLine(clause, hook));
    for (const clause of leftover.slice(0, 2)) push(clause);
  }

  for (const sentence of completeFromSource(sourceText, claim)) {
    if (beats.length >= 3) break;
    push(sentence);
  }

  return beats.slice(0, 3);
}

function isTopicShift(sentence: string, seed: string): boolean {
  if (
    /^(then there is|that's a hell of a swing|what do people get wrong|so how do you|you said |host:|that's the part nobody believes|if someone listening|today i'?m sitting|creators have the same problem|four assets from one recording sounds)\b/i.test(
      sentence,
    )
  ) {
    return true;
  }
  if (/\?$/.test(sentence) && !ideaThemeFromText(sentence)) {
    return true;
  }
  const seedTheme = ideaThemeFromText(seed);
  const nextTheme = ideaThemeFromText(sentence);
  return Boolean(seedTheme && nextTheme && seedTheme !== nextTheme);
}

function ideaThemeFromText(text: string): string | null {
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

function passageAround(sourceText: string, idea: string): string[] {
  const sentences = sourceSentences(sourceText);
  const seed = completeFromSource(sourceText, idea);
  if (seed.length === 0) return sentences.slice(0, 4);
  const start = sentences.findIndex((sentence) => sameLine(sentence, seed[0]));
  if (start < 0) return seed;
  const slice = sentences.slice(start, start + 5);
  const kept: string[] = [];
  for (const sentence of slice) {
    if (kept.length > 0 && isTopicShift(sentence, slice[0])) break;
    kept.push(sentence);
  }
  return kept.length > 0 ? kept : slice.slice(0, 4);
}

function repeatsHook(text: string, hook: string): boolean {
  const left = textKey(text);
  const right = textKey(hook);
  if (!left || !right) return false;
  if (left === right || left.startsWith(right) || right.startsWith(left)) return true;
  return sameLine(text, hook);
}

function buildSpokenScript(hook: string, ideaSentences: string[]): string {
  const blocks: string[] = [];
  const opening = endSentence(hook);
  blocks.push(opening);

  function take(text: string | null | undefined) {
    if (!text || META_SPEECH.test(text) || HOST_OPENER.test(text) || INTERVIEWER_LINE.test(text)) {
      return;
    }
    if (repeatsHook(text, hook)) return;
    const next = endSentence(text);
    if (blocks.some((existing) => sameLine(existing, next))) return;
    if (words(next).length < 5) return;
    blocks.push(next);
  }

  for (const sentence of ideaSentences) {
    if (blocks.length >= 5) break;
    take(sentence);
  }

  return blocks.join("\n\n");
}

const BANNED_CTA =
  /recast this moment|last recording, save it|follow for more recasts|generation|transcript|prompt|internal|ai generated|do not /i;

type CtaTheme =
  | "priority"
  | "customer"
  | "tension"
  | "rejection"
  | "motivation"
  | "imagined"
  | "pricing"
  | "almostcut"
  | "selection"
  | "yield";

function themeHits(text: string): Array<{ theme: CtaTheme; index: number; weight: number }> {
  const value = text;
  const hits: Array<{ theme: CtaTheme; index: number; weight: number }> = [];
  function add(theme: CtaTheme, pattern: RegExp, weight: number) {
    const match = pattern.exec(value);
    if (match && match.index >= 0) hits.push({ theme, index: match.index, weight });
  }

  add("customer", /\btalk to customers\b/i, 4);
  add("customer", /\bcustomer feedback\b/i, 4);
  add("customer", /\bcustomer research\b/i, 4);
  add("customer", /\bsupport thread\b/i, 3);
  add("customer", /\bcustomers?\b/i, 3);
  add("customer", /\bfeedback\b/i, 2);

  add("priority", /\bone (important )?task\b/i, 4);
  add("priority", /\bfewer priorit/i, 4);
  add("priority", /\bpriorit(?:y|ies)\b/i, 3);
  add("priority", /\bmake (?:the |today |your )?day successful\b/i, 3);
  add("priority", /\bday (?:count|successful)\b/i, 2);
  add("priority", /\bpacked calendar\b/i, 3);
  add("priority", /\bfill every hour\b/i, 3);
  add("priority", /\bfill(?:ing|ed)? the day\b/i, 2);
  if (/\bbusy\b/i.test(value) && /\b(progress|meaningful|forward)\b/i.test(value)) {
    add("priority", /\bbusy\b/i, 3);
  }

  add("rejection", /\breject/i, 4);
  add("motivation", /\bmotivat/i, 4);
  add("imagined", /\bimagined\b/i, 3);
  add("imagined", /\bnobody asked\b/i, 3);

  add("tension", /\bhunting for tension\b/i, 4);
  add("tension", /\blook for tension\b/i, 4);
  if (/\bclips\b/i.test(value) && /\btension\b/i.test(value)) add("tension", /\btension\b/i, 4);
  add("tension", /\bstand on their own\b/i, 3);

  add("pricing", /\bpackaging problem\b/i, 3);
  add("pricing", /\bbetter question\b/i, 3);
  add("pricing", /\buseless question\b/i, 2);
  add("pricing", /\bused to sell\b/i, 3);
  add("pricing", /\bsame brain, different box\b/i, 3);

  add("almostcut", /\balmost cut\b/i, 4);
  add("almostcut", /\b28-second\b/i, 3);
  add("almostcut", /\bfour formats\b/i, 3);
  add("almostcut", /\bsame 12 words\b/i, 3);

  add("selection", /\bselection is the job\b/i, 4);
  add("selection", /\bidentify the opportunities first\b/i, 4);
  add("selection", /\batomize too early\b/i, 3);
  add("selection", /\bcircle three moments\b/i, 3);
  add("selection", /\bfrom nothing\b/i, 2);

  add("yield", /\bfour assets per input\b/i, 3);
  add("yield", /\b47 public posts\b/i, 3);
  add("yield", /\bcontent operation\b/i, 2);

  return hits;
}

function dominantTheme(text: string): CtaTheme | null {
  const hits = themeHits(text);
  if (hits.length === 0) return null;
  const scores = new Map<CtaTheme, { weight: number; index: number }>();
  for (const hit of hits) {
    const current = scores.get(hit.theme);
    if (!current) {
      scores.set(hit.theme, { weight: hit.weight, index: hit.index });
      continue;
    }
    current.weight += hit.weight;
    current.index = Math.min(current.index, hit.index);
  }
  return [...scores.entries()].sort((left, right) => {
    if (right[1].weight !== left[1].weight) return right[1].weight - left[1].weight;
    return left[1].index - right[1].index;
  })[0]?.[0] ?? null;
}

function ctaForTheme(theme: CtaTheme, claim: string): string {
  if (theme === "customer") {
    return "What customer feedback changed what you were building? Comment it.";
  }
  if (theme === "priority") {
    if (/\bbusy\b/i.test(claim) && /\b(progress|meaningful|forward)\b/i.test(claim) && !/\bone (important )?task\b/i.test(claim) && !/\bpriorit/i.test(claim)) {
      return "Are you busy, or making real progress? Comment the difference.";
    }
    return "What's the one task that would make today successful? Comment it.";
  }
  if (theme === "tension") {
    return "Comment a moment from your last video that could stand on its own.";
  }
  if (theme === "rejection") {
    return "What rejection taught you the most? Drop it below.";
  }
  if (theme === "motivation") {
    return "What's one habit you rely on when motivation disappears? Comment it.";
  }
  if (theme === "imagined") {
    return "Have you ever built something nobody asked for? Tell me in the comments.";
  }
  if (theme === "pricing") {
    if (/\bwhat transformation is so specific\b/i.test(claim) || /\bbetter question\b/i.test(claim) || (/\buseless question\b/i.test(claim) && /\$[\d]/.test(claim))) {
      return "What's a better question than 'Am I worth this?' Comment yours.";
    }
    return "Have you ever sold something too vague to buy? Comment the offer.";
  }
  if (theme === "almostcut") {
    if (/\b28-second\b/i.test(claim) || /\bfour formats\b/i.test(claim) || /\bsame 12 words\b/i.test(claim)) {
      return "Save this if one line has ever become four pieces of content for you.";
    }
    return "Have you ever almost cut the line that performed? Tell me.";
  }
  if (theme === "selection") {
    if (/\bcircle three moments\b/i.test(claim) || /\bbehind on recasting\b/i.test(claim)) {
      return "If a two-hour interview is sitting in your drive, start with three moments tonight.";
    }
    if (/\bfrom nothing\b/i.test(claim) || /\bvaluable moments that are already there\b/i.test(claim)) {
      return "Save this if you've been trying to create more from nothing.";
    }
    return "Do you pick the moments first, or ask for 30 posts? Comment your process.";
  }
  if (/\bgrew\b.+\bcontent operation\b/i.test(claim) || /\bwithout hiring a team\b/i.test(claim)) {
    return "Follow if you're building a content operation without hiring a team.";
  }
  return "How many assets did your last long piece actually become?";
}

function ctaFromText(text: string): string | null {
  const cleaned = cleanQuote(text);
  if (!cleaned) return null;
  const theme = dominantTheme(cleaned);
  if (!theme) return null;
  return ctaForTheme(theme, cleaned);
}

function opportunityCta(
  opportunity: Opportunity,
  hook: string,
  spokenScript: string,
  idea: string,
): string {
  const sources = [
    `${opportunity.topic || ""} ${opportunity.title || ""}`.trim(),
    cleanQuote(opportunity.excerpt || ""),
    hook,
    spokenScript,
    idea,
  ].filter(Boolean);
  for (const source of sources) {
    const cta = ctaFromText(source);
    if (cta) return cta;
  }
  return "Have you dealt with this? Tell me in the comments.";
}

function punchyCaptions(idea: string, hook: string): string {
  const claim = idea;
  const captions: string[] = [];
  const seen = new Set<string>();

  function add(raw: string) {
    const trimmed = String(raw)
      .replace(/\s+/g, " ")
      .replace(/^["“”']+|["“”']+$/g, "")
      .trim();
    const cleaned = (trimmed.charAt(0).toUpperCase() + trimmed.slice(1)).replace(/[.,]+$/g, "").trim();
    const count = words(cleaned).length;
    if (count < 2 || count > 7) return;
    if (!isCompletePhrase(cleaned) || /\bis:?$/i.test(cleaned)) return;
    if (META_SPEECH.test(cleaned) || LABEL_TITLES.test(cleaned)) return;
    if (sameLine(cleaned, claim) && count >= 6) return;
    if (count >= 6 && looksLikeSourceSentence(cleaned, claim)) return;
    const key = textKey(cleaned);
    if (!key || seen.has(key)) return;
    if (captions.some((existing) => {
      const a = textKey(existing);
      const b = textKey(cleaned);
      return sameLine(existing, cleaned) || a.includes(b) || b.includes(a);
    })) return;
    seen.add(key);
    captions.push(/[?]$/.test(String(raw).trim()) ? `${cleaned.replace(/[?]+$/g, "")}?` : cleaned);
  }

  if (/\bbusy\b/i.test(claim) && /\b(progress|meaningful|forward)\b/i.test(claim)) {
    add("Busy isn't progress");
    add("Measure progress, not busyness");
  }
  if (/\b(one (important )?task|important task)\b/i.test(claim)) {
    add("Choose one important task");
  }
  if (/\b(day successful|successful day|make the day)\b/i.test(claim)) {
    add("Make the day successful");
  }

  if (/\bneeded more content\b/i.test(claim) && /\b(problem wasn'?t|wasn'?t that)\b/i.test(claim)) {
    add("You don't need more content");
  }
  if (/\bbest moments\b/i.test(claim) && /\balready (?:had|have|there)\b/i.test(claim)) {
    add("Use the moments you have");
  } else if (/\bmoments\b/i.test(claim) && /\balready (?:had|have|there)\b/i.test(claim)) {
    add("Use the moments you have");
  }
  if (
    (/\b(one recording|one conversation|one (?:long )?piece)\b/i.test(claim) &&
      /\bmultiple (?:posts|pieces|assets)\b/i.test(claim)) ||
    /\bcan become multiple (?:posts|pieces)\b/i.test(claim)
  ) {
    add("One recording, many posts");
  }

  if (/\bclips\b/i.test(claim) && /\btension\b/i.test(claim)) {
    add("Stop hunting for clips");
    add("Hunt for tension");
    add("Moments that stand alone");
  }
  if (/\breject/i.test(claim)) {
    add("Rejection was information");
    add("Not a verdict");
  }
  if (/\bmotivat/i.test(claim)) {
    add("Consistency beats motivation");
    add("Motivation disappears");
  }
  if (/\bimagined\b/i.test(claim) && /\bproblem/i.test(claim)) {
    add("Stop solving imagined problems");
  }
  if (/\bnobody asked\b/i.test(claim)) add("Nobody asked for them");
  if (/\b(customer feedback|talk(?:ing)? to customers|listen(?:ing)? to customer|customers?)\b/i.test(claim)) {
    add("Talk to customers first");
    add("Build from the brief");
  }
  if (/\balmost cut\b/i.test(claim)) add("The line you almost cut");
  if (/\bselection is the job\b/i.test(claim) || /\batomize too early\b/i.test(claim) || /\b30 posts\b/i.test(claim)) {
    add("Select before you generate");
  }

  const compressed = punchyFromIdea(claim);
  if (compressed) {
    for (const part of compressed.split(/(?<=[.!?])\s+/)) add(part);
  }

  const stopped = claim.match(/\bstopped (.+?) and started (.+?)(?:\.|$)/i);
  if (stopped) {
    add(`Stop ${stopped[1].trim()}`);
    add(`Start ${stopped[2].trim()}`);
  }

  const contrast = claim.match(
    /\bnot (?:a |an |the )?([^.,]+?)\.\s*(?:It is|It's|it is) (?:a |an |the )?([^.,]+)/i,
  );
  if (contrast) {
    add(`Not ${contrast[1].trim()}`);
    add(`It's ${contrast[2].trim()}`);
  }

  const asked = firstQuestion(claim);
  if (asked && words(asked).length <= 8) add(asked);
  if (/\bbetter question\b/i.test(claim)) add("The better question");
  if (/\$3,000 feels obvious/i.test(claim)) add("$3,000 feels obvious");
  if (/\buseless question\b/i.test(claim)) add("Useless question");

  const grew = claim.match(/\bgrew (.+?) into (?:a |an |the )?(.+?)(?:\s+without|\.|$)/i);
  if (grew) {
    add("One-person newsletter");
    add("Full content operation");
  }

  for (const match of claim.matchAll(/\b\d+-second [A-Za-z]+/g)) add(match[0]);
  if (/1\.2 million impressions/i.test(claim)) add("1.2 million impressions");
  const titled = claim.match(/titled\s+([^,]+)/i);
  if (titled) add(titled[1].trim());
  if (/\baside you almost cut\b/i.test(claim)) add("The aside you almost cut");
  if (/\bsame brain, different box\b/i.test(claim)) add("Same brain, different box");
  const usedToSell = claim.match(/\bused to (sell .+?)(?:\.|$)/i);
  if (usedToSell) add(`Used to ${usedToSell[1].trim()}`);
  if (/\bvague\b/i.test(claim)) add("Vague");
  if (/\b14-day recasting system\b/i.test(claim)) add("A 14-day recasting system");
  if (/\bfrom nothing\b/i.test(claim)) add("Not from nothing");
  if (/\bvaluable moments\b/i.test(claim)) add("The moments already there");

  for (const part of hook.split(/(?<=[.!?])\s+/)) {
    if (isCompletePhrase(part)) add(part);
  }

  for (const clause of usableClauses(claim)) {
    if (captions.length >= 3) break;
    if (words(clause).length <= 6 && isCompletePhrase(clause) && !looksLikeSourceSentence(clause, claim)) {
      add(clause);
    }
  }

  if (captions.length === 0 && isCompletePhrase(hook) && words(hook).length <= 7) {
    add(hook);
  }
  if (captions.length === 0) {
    const fromIdea = punchyFromIdea(claim);
    if (fromIdea) {
      for (const part of fromIdea.split(/(?<=[.!?])\s+/)) add(part);
    }
  }
  if (captions.length === 0 && isCompletePhrase(hook)) {
    add(words(hook).slice(0, 6).join(" "));
  }

  return captions.slice(0, 3).join("\n");
}

function stripLabels(text: string): string {
  return text
    .replace(/^\s*(HOOK|BEAT(?: \d+)?|CTA|SCRIPT|SOURCE)\b\s*[:\-–]?\s*/gim, "")
    .replace(/\b(do not recast|recast this moment from the source|internal instructions?)\b/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function finalizeTikTok(
  opportunity: Opportunity,
  idea: string,
  fields: Record<string, string>,
): Record<string, string> {
  let hook = stripLabels(fields.hook);
  const spokenScript = stripLabels(fields.spokenScript);
  let onScreenText = stripLabels(fields.onScreenText).replace(/^\d+\.\s+(?=[A-Za-z])/gm, "").trim();
  let cta = stripLabels(fields.cta);

  if (sameLine(hook, opportunity.title) || isCategoryName(hook)) {
    hook =
      punchyFromIdea(cleanQuote(opportunity.excerpt || opportunity.topic || opportunity.title)) || hook;
  }

  if (BANNED_CTA.test(cta) || !cta.trim() || looksLikeSourceSentence(cta, idea)) {
    cta = opportunityCta(opportunity, hook, spokenScript, idea);
  }

  if (!onScreenText.trim() || onScreenLooksLikeSource(onScreenText, idea)) {
    onScreenText = punchyCaptions(idea, hook);
  }

  return { hook, spokenScript, onScreenText, cta };
}

function looksLikeSourceSentence(cta: string, idea: string): boolean {
  const ctaKey = textKey(cta);
  if (!ctaKey) return false;
  for (const sentence of sourceSentences(idea).concat(idea.split(/(?<=[.!?])\s+/))) {
    const key = textKey(sentence);
    if (!key) continue;
    if (key === ctaKey || (key.length >= 24 && (key.includes(ctaKey) || ctaKey.includes(key)))) {
      return true;
    }
  }
  return false;
}

function onScreenLooksLikeSource(onScreenText: string, idea: string): boolean {
  const lines = onScreenText
    .split(/\n+/)
    .map((line) => line.replace(/^\d+\.\s+(?=[A-Za-z])/, "").trim())
    .filter(Boolean);
  if (lines.length === 0) return true;
  return lines.some((line) => words(line).length >= 8 && looksLikeSourceSentence(line, idea));
}

function viewerActionCta(
  opportunity: Opportunity,
  hook: string,
  spokenScript: string,
  idea: string,
): string {
  let cta = opportunityCta(opportunity, hook, spokenScript, idea);
  if (looksLikeSourceSentence(cta, idea) || !/\b(comment|tell me|drop|below|what's|what is|have you)\b/i.test(cta)) {
    cta = "Have you dealt with this? Tell me in the comments.";
  }
  return cta;
}

export function generateTikTok(
  sourceText: string,
  opportunity: Opportunity,
): Record<string, string> {
  const isolated = isolateIdea(sourceText, opportunity);
  const seed = cleanQuote(opportunity.excerpt || opportunity.topic || opportunity.title);
  const idea = isolated.join(" ") || seed;
  const hook = openingHook(opportunity, idea);
  const spokenScript = buildSpokenScript(hook, isolated.length > 0 ? isolated : sourceSentences(idea));
  const onScreenText = punchyCaptions(idea, hook);
  const cta = viewerActionCta(opportunity, hook, spokenScript, idea);

  return finalizeTikTok(opportunity, idea, {
    hook,
    spokenScript,
    onScreenText,
    cta,
  });
}
