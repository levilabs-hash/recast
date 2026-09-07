import { analyzeLocally, extractDistinctOpportunities, generateLocally, refineDistinctOpportunities } from "./local-engine";
import {
  analyzeWithOpenAI,
  generateWithOpenAI,
  isOpenAIConfigured,
} from "./openai";
import {
  normalizeAnalyzeOpportunities,
  outputsToPackages,
} from "./opportunity-schema";
import { normalizePlatforms, type PlatformId } from "./platforms";
import { generateTikTok, type TikTokUsed } from "./platforms/tiktok";
import type { AnalysisResult, GeneratedPiece, GenerationResult, Opportunity } from "./types";

const MIN_CHARS = 80;
const MAX_CHARS = 20000;

export function validateSourceText(sourceText: unknown): string {
  if (typeof sourceText !== "string") {
    throw new Error("Source text is required.");
  }
  const text = sourceText.replace(/\r\n/g, "\n").trim();
  if (text.length < MIN_CHARS) {
    throw new Error(`Paste at least ${MIN_CHARS} characters so RECAST has enough material to analyze.`);
  }
  if (text.length > MAX_CHARS) {
    throw new Error(`Source is too long. Trim it to ${MAX_CHARS.toLocaleString()} characters for this MVP.`);
  }
  return text;
}

export async function analyzeContent(sourceText: string): Promise<AnalysisResult> {
  let result: AnalysisResult;
  if (isOpenAIConfigured()) {
    try {
      result = await analyzeWithOpenAI(sourceText);
    } catch (error) {
      console.error("OpenAI analysis failed, using local engine.", error);
      result = analyzeLocally(sourceText);
    }
  } else {
    result = analyzeLocally(sourceText);
  }

  const parsed = normalizeAnalyzeOpportunities({ opportunities: result.opportunities });
  return {
    ...result,
    opportunities: refineDistinctOpportunities(
      sourceText,
      parsed.length > 0 ? parsed : result.opportunities,
    ),
  };
}

function resolveOpportunities(sourceText: string, incoming: Opportunity[]): Opportunity[] {
  const parsed = normalizeAnalyzeOpportunities({ opportunities: incoming });
  const extracted = extractDistinctOpportunities(sourceText);
  if (parsed.length <= 1 && extracted.length >= 2 && sourceText.length >= 500) {
    return extracted;
  }
  return parsed.length > 0 ? parsed : extracted;
}

function applyTikTokGenerator(
  sourceText: string,
  opportunities: Opportunity[],
  result: GenerationResult,
): GenerationResult {
  if (!result.platforms.includes("tiktok")) {
    return {
      ...result,
      opportunities: result.opportunities ?? [],
    };
  }

  const used: TikTokUsed = { hooks: [], scripts: [], ctas: [], captions: [], paragraphs: [] };
  const tiktokFields = new Map<string, Record<string, string>>();
  for (const opportunity of opportunities) {
    tiktokFields.set(opportunity.id, generateTikTok(sourceText, opportunity, used));
  }

  const outputs: GeneratedPiece[] = [];
  const seenTikTok = new Set<string>();

  for (const output of result.outputs) {
    if (output.platform !== "tiktok") {
      outputs.push(output);
      continue;
    }
    const opportunity = opportunities.find((item) => item.id === output.opportunityId);
    const fields = tiktokFields.get(output.opportunityId);
    if (!opportunity || !fields) {
      outputs.push(output);
      continue;
    }
    outputs.push({ ...output, fields });
    seenTikTok.add(opportunity.id);
  }

  for (const opportunity of opportunities) {
    if (seenTikTok.has(opportunity.id)) continue;
    const fields = tiktokFields.get(opportunity.id);
    if (!fields) continue;
    outputs.push({
      opportunityId: opportunity.id,
      opportunityTitle: opportunity.title,
      opportunityKind: opportunity.kind,
      platform: "tiktok",
      fields,
    });
  }

  return {
    ...result,
    outputs,
    opportunities: outputsToPackages(outputs),
  };
}

export async function generateContent(
  sourceText: string,
  opportunities: Opportunity[],
  platforms: PlatformId[] = normalizePlatforms(undefined),
): Promise<GenerationResult> {
  const resolved = resolveOpportunities(sourceText, opportunities);
  if (resolved.length === 0) {
    throw new Error("Select at least one opportunity to generate content.");
  }
  if (platforms.length === 0) {
    throw new Error("Select at least one platform to generate content.");
  }

  let result: GenerationResult;
  if (isOpenAIConfigured()) {
    try {
      result = await generateWithOpenAI(sourceText, resolved, platforms);
    } catch (error) {
      console.error("OpenAI generation failed, using local engine.", error);
      result = generateLocally(sourceText, resolved, platforms);
    }
  } else {
    result = generateLocally(sourceText, resolved, platforms);
  }

  return applyTikTokGenerator(sourceText, resolved, result);
}
