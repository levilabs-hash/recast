import type { GeneratedPiece, Opportunity, OpportunityKind, OpportunityPackage } from "./types";

const KINDS: OpportunityKind[] = ["topic", "moment", "hook", "angle"];

export const ANALYZE_OPPORTUNITIES_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["opportunities"],
  properties: {
    opportunities: {
      type: "array",
      minItems: 1,
      maxItems: 5,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["topic", "excerpt", "whyValuable"],
        properties: {
          topic: { type: "string" },
          excerpt: { type: "string" },
          whyValuable: { type: "string" },
        },
      },
    },
  },
} as const;

export const GENERATE_OPPORTUNITIES_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["opportunities"],
  properties: {
    opportunities: {
      type: "array",
      minItems: 1,
      maxItems: 5,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "topic", "hook", "spokenScript", "onScreenText", "cta"],
        properties: {
          id: { type: "string" },
          topic: { type: "string" },
          hook: { type: "string" },
          spokenScript: { type: "string" },
          onScreenText: {
            type: "array",
            minItems: 1,
            maxItems: 3,
            items: { type: "string" },
          },
          cta: { type: "string" },
        },
      },
    },
  },
} as const;

export function extractOpportunityList(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== "object") return [];
  const record = data as Record<string, unknown>;
  const raw =
    record.opportunities ??
    record.packages ??
    record.items ??
    record.results ??
    record.data;
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === "object") {
    const nested = raw as Record<string, unknown>;
    if (Array.isArray(nested.opportunities)) return nested.opportunities;
    return [raw];
  }
  return [];
}

function asString(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

function asStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter(Boolean)
      .slice(0, 3);
  }
  if (typeof value === "string") {
    return value
      .split(/\n+/)
      .map((item) => item.replace(/^\d+\.\s+(?=[A-Za-z])/, "").trim())
      .filter(Boolean)
      .slice(0, 3);
  }
  return [];
}

export function normalizeOpportunity(value: unknown, index: number): Opportunity | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const topic = asString(record.topic) || asString(record.title);
  const excerpt = asString(record.excerpt) || asString(record.hook) || topic;
  const whyValuable =
    asString(record.whyValuable) ||
    "This idea is grounded in the source and can stand as its own short-form piece.";
  if (!topic || !excerpt) return null;
  const kind = KINDS.includes(record.kind as OpportunityKind)
    ? (record.kind as OpportunityKind)
    : "topic";
  const id =
    typeof record.id === "string" && record.id.trim()
      ? record.id.trim()
      : `${kind}-${index + 1}`;
  return {
    id,
    kind,
    title: topic,
    topic,
    excerpt,
    whyValuable,
  };
}

export function normalizeAnalyzeOpportunities(data: unknown): Opportunity[] {
  return extractOpportunityList(data)
    .map((item, index) => normalizeOpportunity(item, index))
    .filter((item): item is Opportunity => item !== null)
    .map((item, index) => ({ ...item, id: item.id || `topic-${index + 1}` }))
    .slice(0, 5);
}

export function normalizeOpportunityPackage(
  value: unknown,
  index: number,
): OpportunityPackage | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const fields =
    record.fields && typeof record.fields === "object"
      ? (record.fields as Record<string, unknown>)
      : record;
  const topic =
    asString(record.topic) ||
    asString(record.opportunityTitle) ||
    asString(record.title);
  const hook = asString(fields.hook);
  const spokenScript = asString(fields.spokenScript);
  const onScreenText = asStringList(fields.onScreenText);
  const cta = asString(fields.cta);
  if (!topic || !hook || !spokenScript || onScreenText.length === 0 || !cta) return null;
  const id =
    asString(record.id) ||
    asString(record.opportunityId) ||
    `topic-${index + 1}`;
  return { id, topic, hook, spokenScript, onScreenText, cta };
}

export function normalizeGeneratedPackages(data: unknown): OpportunityPackage[] {
  const fromOpportunities = extractOpportunityList(data)
    .map((item, index) => normalizeOpportunityPackage(item, index))
    .filter((item): item is OpportunityPackage => item !== null);

  if (fromOpportunities.length > 0) return fromOpportunities.slice(0, 5);

  if (!data || typeof data !== "object") return [];
  const outputs = (data as { outputs?: unknown }).outputs;
  if (!Array.isArray(outputs)) return [];
  return outputs
    .filter((item) => {
      if (!item || typeof item !== "object") return false;
      return (item as { platform?: string }).platform === "tiktok";
    })
    .map((item, index) => normalizeOpportunityPackage(item, index))
    .filter((item): item is OpportunityPackage => item !== null)
    .slice(0, 5);
}

export function packageToOpportunity(item: OpportunityPackage): Opportunity {
  return {
    id: item.id,
    kind: "topic",
    title: item.topic,
    topic: item.topic,
    excerpt: item.hook,
    whyValuable: "Generated as a standalone TikTok/Reels package from a distinct source idea.",
  };
}

export function packageToTikTokOutput(item: OpportunityPackage): GeneratedPiece {
  return {
    opportunityId: item.id,
    opportunityTitle: item.topic,
    opportunityKind: "topic",
    platform: "tiktok",
    fields: {
      hook: item.hook,
      spokenScript: item.spokenScript,
      onScreenText: item.onScreenText.join("\n"),
      cta: item.cta,
    },
  };
}

export function outputsToPackages(outputs: GeneratedPiece[]): OpportunityPackage[] {
  return outputs
    .filter((item) => item.platform === "tiktok")
    .map((item, index) =>
      normalizeOpportunityPackage(
        {
          id: item.opportunityId,
          topic: item.opportunityTitle,
          fields: item.fields,
        },
        index,
      ),
    )
    .filter((item): item is OpportunityPackage => item !== null);
}

export function isValidOpportunity(value: unknown): value is Opportunity {
  return normalizeOpportunity(value, 0) !== null;
}
