import { getPlatform, isPlatformId, type PlatformId } from "./platforms";
import type {
  AnalysisResult,
  GeneratedPiece,
  GenerationResult,
  Opportunity,
  OpportunityKind,
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

async function completeJson(system: string, user: string): Promise<unknown> {
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
      response_format: { type: "json_object" },
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

const KINDS: OpportunityKind[] = ["topic", "moment", "hook", "angle"];

function asOpportunity(value: unknown, index: number): Opportunity | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const kind = KINDS.includes(record.kind as OpportunityKind)
    ? (record.kind as OpportunityKind)
    : null;
  const title = typeof record.title === "string" ? record.title.trim() : "";
  const excerpt = typeof record.excerpt === "string" ? record.excerpt.trim() : "";
  const whyValuable =
    typeof record.whyValuable === "string" ? record.whyValuable.trim() : "";
  if (!kind || !title || !excerpt || !whyValuable) return null;
  const id =
    typeof record.id === "string" && record.id.trim()
      ? record.id.trim()
      : `${kind}-${index + 1}`;
  return { id, kind, title, excerpt, whyValuable };
}

export async function analyzeWithOpenAI(sourceText: string): Promise<AnalysisResult> {
  const data = await completeJson(
    [
      "You are RECAST, an AI content operations engine for creators.",
      "Analyze long-form source material and find reusable content opportunities.",
      "Return JSON only with this shape:",
      '{ "opportunities": [{ "id": "topic-1", "kind": "topic|moment|hook|angle", "title": "", "excerpt": "", "whyValuable": "" }] }',
      "Rules:",
      "- Use only information present in the source. Do not invent facts, stats, or quotes.",
      "- Include 2-3 topics, 3-4 high-value moments, 2-3 hooks, and 2-3 content angles.",
      "- excerpt must be a close paraphrase or a short quote from the source.",
      "- whyValuable must explain why this is worth publishing, in one or two sentences.",
      "- Titles should be specific and usable as card headlines.",
    ].join("\n"),
    `Source content:\n\n${sourceText}`,
  );

  const record = data as { opportunities?: unknown };
  const list = Array.isArray(record.opportunities) ? record.opportunities : [];
  const opportunities = list
    .map((item, index) => asOpportunity(item, index))
    .filter((item): item is Opportunity => item !== null)
    .slice(0, 12);

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

  const data = await completeJson(
    [
      "You are RECAST, generating platform-specific content from selected opportunities.",
      "Return JSON only with this shape:",
      '{ "outputs": [{ "opportunityId": "", "opportunityTitle": "", "platform": "tiktok|x|linkedin|instagram|youtube", "fields": { "fieldKey": "text" } }] }',
      "Rules:",
      "- Produce one output object per opportunity per selected platform.",
      "- Use only the selected platforms.",
      "- Stay faithful to the source and the selected opportunity. Do not invent facts, statistics, experiences, or quotes.",
      "- Leave optional fields empty when the source does not support them.",
      "For platform tiktok only:",
      "- hook: exactly one punchy spoken opening line from the source idea. Never use a topic or category name (e.g. \"Creating Content\"). Never explain what the AI is doing.",
      "- spokenScript: 25-40 seconds of natural talking-head dialogue a creator can read into a camera. Start with the hook, then 2-3 source-based beats, then end naturally. Do not include labels such as HOOK, BEAT, CTA, or SOURCE. Do not expose internal instructions or generation logic. Do not invent facts.",
      "- onScreenText: 1-3 short on-screen captions from the source. Not a copied long sentence. Not internal instructions.",
      "- cta: a viewer-facing call to action (comment, follow, save, share, or reflect). Never \"recast this moment from the source.\" Never describe the generation process.",
      "Do not apply the tiktok field rules to linkedin or other platforms.",
      "Selected platform fields:",
      fieldGuide,
    ].join("\n"),
    [
      `Source content:\n${sourceText}`,
      "",
      `Selected platforms: ${platforms.join(", ")}`,
      "",
      `Selected opportunities:\n${JSON.stringify(opportunities, null, 2)}`,
    ].join("\n"),
  );

  const record = data as { outputs?: unknown };
  const list = Array.isArray(record.outputs) ? record.outputs : [];
  const outputs = opportunities.flatMap((opportunity) =>
    platforms.map((platform) => {
      const match = list.find((item) => {
        if (!item || typeof item !== "object") return false;
        const row = item as { opportunityId?: string; platform?: string };
        return row.opportunityId === opportunity.id && isPlatformId(row.platform) && row.platform === platform;
      });
      return asGeneratedPiece(match, opportunity, platform);
    }),
  ).filter((item): item is GeneratedPiece => item !== null);

  if (outputs.length === 0) {
    throw new Error("OpenAI generation returned no usable outputs.");
  }

  return { engine: "openai", platforms, outputs };
}
