import { analyzeLocally, generateLocally } from "./local-engine";
import {
  analyzeWithOpenAI,
  generateWithOpenAI,
  isOpenAIConfigured,
} from "./openai";
import { normalizePlatforms, type PlatformId } from "./platforms";
import type { AnalysisResult, GenerationResult, Opportunity } from "./types";

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
  if (isOpenAIConfigured()) {
    try {
      return await analyzeWithOpenAI(sourceText);
    } catch (error) {
      console.error("OpenAI analysis failed, using local engine.", error);
    }
  }
  return analyzeLocally(sourceText);
}

export async function generateContent(
  sourceText: string,
  opportunities: Opportunity[],
  platforms: PlatformId[] = normalizePlatforms(undefined),
): Promise<GenerationResult> {
  if (opportunities.length === 0) {
    throw new Error("Select at least one opportunity to generate content.");
  }
  if (platforms.length === 0) {
    throw new Error("Select at least one platform to generate content.");
  }

  if (isOpenAIConfigured()) {
    try {
      return await generateWithOpenAI(sourceText, opportunities, platforms);
    } catch (error) {
      console.error("OpenAI generation failed, using local engine.", error);
    }
  }
  return generateLocally(sourceText, opportunities, platforms);
}
