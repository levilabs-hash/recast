import {
  analyzeLocally,
  extractDistinctOpportunities,
  generateLocally,
  polishOpportunityPresentation,
  refineDistinctOpportunities,
} from "./local-engine";
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
import { generateTikTok } from "./platforms/tiktok";
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
  const resolved =
    parsed.length <= 1 && extracted.length >= 2 && sourceText.length >= 500
      ? extracted
      : parsed.length > 0
        ? parsed
        : extracted;
  return polishOpportunityPresentation(sourceText, resolved);
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

  const tiktokOutputs: GeneratedPiece[] = opportunities.map((opportunity) => ({
    opportunityId: opportunity.id,
    opportunityTitle: opportunity.title,
    opportunityKind: opportunity.kind,
    platform: "tiktok",
    fields: generateTikTok(sourceText, opportunity),
  }));
  const otherOutputs = result.outputs.filter((output) => output.platform !== "tiktok");

  return {
    ...result,
    outputs: [...tiktokOutputs, ...otherOutputs],
    opportunities: outputsToPackages(tiktokOutputs),
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
