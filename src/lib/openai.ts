import {
  ANALYZE_OPPORTUNITIES_SCHEMA,
  GENERATE_OPPORTUNITIES_SCHEMA,
  normalizeAnalyzeOpportunities,
  normalizeGeneratedPackages,
  packageToTikTokOutput,
} from "./opportunity-schema";
import { getPlatform, isPlatformId, type PlatformId } from "./platforms";
import type {
  AnalysisResult,
  GeneratedPiece,
  GenerationResult,
  Opportunity,
} from "./types";

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const MODEL = process.env.OPENAI_MODEL ?? "gpt-4o-mini";

interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
  error?: {
    message?: string;
  };
}

function getApiKey(): string | undefined {
  const key = process.env.OPENAI_API_KEY?.trim();
  return key || undefined;
}

export function isOpenAIConfigured(): boolean {
  return Boolean(getApiKey());
}

function parseJsonContent(raw: string): unknown {
  const stripped = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  return JSON.parse(stripped);
}

async function completeJson(
  system: string,
  user: string,
  schema?: Record<string, unknown>,
): Promise<unknown> {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }

  const response = await fetch(OPENAI_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.4,
      response_format: schema
        ? {
            type: "json_schema",
            json_schema: {
              name: "recast_opportunities",
              strict: true,
              schema,
            },
          }
        : { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });

  const payload = (await response.json()) as ChatCompletionResponse;
  if (!response.ok) {
    throw new Error(payload.error?.message ?? `OpenAI request failed (${response.status})`);
  }

  const content = payload.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("OpenAI returned an empty response.");
  }

  return parseJsonContent(content);
}

export async function analyzeWithOpenAI(sourceText: string): Promise<AnalysisResult> {
  let data: unknown;
  try {
    data = await completeJson(
      [
        "You are RECAST, an AI content operations engine for creators.",
        "Analyze long-form source material and return DISTINCT reusable content opportunities.",
        "Return JSON with an opportunities ARRAY. Never return one object that mixes several ideas.",
        "Each array item is one independent idea.",
        "Rules:",
        "- Find the strongest independent ideas in the source.",
        "- Separate genuinely different ideas. Do not rephrase the same idea twice.",
        "- Ground every opportunity in the source. Do not invent claims.",
        "- Return 3-5 opportunities when the source contains enough distinct material.",
        "- Return fewer only when the source genuinely lacks enough distinct ideas.",
        "- topic: a concise label for that one idea.",
        "- excerpt: a short quote or close paraphrase from the source for that idea only.",
        "- whyValuable: one or two sentences on why this idea can stand alone.",
      ].join("\n"),
      `Source content:\n\n${sourceText}`,
      ANALYZE_OPPORTUNITIES_SCHEMA,
    );
  } catch {
    data = await completeJson(
      [
        "You are RECAST. Return JSON only.",
        '{ "opportunities": [{ "topic": "", "excerpt": "", "whyValuable": "" }] }',
        "opportunities MUST be an array of 3-5 distinct source-grounded ideas when the source is long enough.",
        "Never hide multiple ideas inside one object.",
      ].join("\n"),
      `Source content:\n\n${sourceText}`,
    );
  }

  const opportunities = normalizeAnalyzeOpportunities(data);
  if (opportunities.length === 0) {
    throw new Error("OpenAI analysis returned no usable opportunities.");
  }

  return { engine: "openai", opportunities };
}

function asGeneratedPiece(
  value: unknown,
  fallback: Opportunity,
  platform: PlatformId,
): GeneratedPiece | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const rawFields =
    record.fields && typeof record.fields === "object"
      ? (record.fields as Record<string, unknown>)
      : record;
  const definition = getPlatform(platform);
  const fields: Record<string, string> = {};
  for (const field of definition.fields) {
    const raw = rawFields[field.key];
    const text = typeof raw === "string" ? raw.trim() : Array.isArray(raw) ? raw.join(" ") : "";
    if (!field.optional && !text) return null;
    if (text) fields[field.key] = text;
  }

  return {
    opportunityId:
      typeof record.opportunityId === "string" && record.opportunityId.trim()
        ? record.opportunityId
        : fallback.id,
    opportunityTitle:
      typeof record.opportunityTitle === "string" && record.opportunityTitle.trim()
        ? record.opportunityTitle
        : fallback.title,
    opportunityKind: fallback.kind,
    platform,
    fields,
  };
}

export async function generateWithOpenAI(
  sourceText: string,
  opportunities: Opportunity[],
  platforms: PlatformId[],
): Promise<GenerationResult> {
  const fieldGuide = platforms
    .map((id) => {
      const platform = getPlatform(id);
      const keys = platform.fields
        .map((field) => `${field.key}${field.optional ? " (optional)" : ""}`)
        .join(", ");
      return `- ${platform.label} (${id}): ${keys}. ${platform.hint}`;
    })
    .join("\n");

  const wantsTikTok = platforms.includes("tiktok");
  const tiktokOnly = wantsTikTok && platforms.length === 1;

  const data = await completeJson(
    [
      "You are RECAST, generating platform-specific content from selected opportunities.",
      "Return JSON with an opportunities ARRAY. Each array item is one complete TikTok/Reels package.",
      '{ "opportunities": [{ "id": "", "topic": "", "hook": "", "spokenScript": "", "onScreenText": ["", ""], "cta": "" }] }',
      "Rules:",
      "- opportunities MUST be a JSON array. Never a single object. Never one blob that hides multiple ideas.",
      "- Produce one array item per selected opportunity.",
      "- Separate genuinely different ideas. Do not rephrase the same idea twice.",
      "- Ground every field in the source. Do not invent claims.",
      "- topic: concise label for that one idea.",
      "- hook: one punchy spoken opening line from that idea. Not a category name.",
      "- spokenScript: a coherent 25-40 second talking-head read for that idea only.",
      "- onScreenText: 1-3 short captions as a string array.",
      "- cta: specific to that opportunity. Not a generic save-this line.",
      wantsTikTok && !tiktokOnly
        ? 'Also include "outputs" for non-tiktok platforms: [{ "opportunityId": "", "opportunityTitle": "", "platform": "", "fields": {} }]'
        : "",
      "Selected platform fields:",
      fieldGuide,
    ].filter(Boolean).join("\n"),
    [
      `Source content:\n${sourceText}`,
      "",
      `Selected platforms: ${platforms.join(", ")}`,
      "",
      `Selected opportunities:\n${JSON.stringify(opportunities, null, 2)}`,
    ].join("\n"),
    tiktokOnly ? GENERATE_OPPORTUNITIES_SCHEMA : undefined,
  );

  const packages = normalizeGeneratedPackages(data);
  const tiktokOutputs = packages.map((item) => packageToTikTokOutput(item));

  const record = data as { outputs?: unknown };
  const list = Array.isArray(record.outputs) ? record.outputs : [];
  const otherOutputs = opportunities.flatMap((opportunity) =>
    platforms
      .filter((platform) => platform !== "tiktok")
      .map((platform) => {
        const match = list.find((item) => {
          if (!item || typeof item !== "object") return false;
          const row = item as { opportunityId?: string; platform?: string };
          return row.opportunityId === opportunity.id && isPlatformId(row.platform) && row.platform === platform;
        });
        return asGeneratedPiece(match, opportunity, platform);
      }),
  ).filter((item): item is GeneratedPiece => item !== null);

  const outputs = [...tiktokOutputs, ...otherOutputs];
  if (outputs.length === 0) {
    throw new Error("OpenAI generation returned no usable outputs.");
  }

  return { engine: "openai", platforms, outputs, opportunities: packages };
}
