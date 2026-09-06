export const PLATFORM_IDS = ["tiktok", "x", "linkedin", "instagram", "youtube"] as const;

export type PlatformId = (typeof PLATFORM_IDS)[number];

export interface PlatformField {
  key: string;
  label: string;
  hint: string;
  optional?: boolean;
}

export interface PlatformDefinition {
  id: PlatformId;
  label: string;
  hint: string;
  fields: PlatformField[];
}

export const PLATFORMS: PlatformDefinition[] = [
  {
    id: "tiktok",
    label: "TikTok / Reels",
    hint: "Spoken 25–40s structure",
    fields: [
      { key: "hook", label: "Hook", hint: "Opening line" },
      { key: "spokenScript", label: "Spoken script", hint: "Timed talking-head beats" },
      { key: "onScreenText", label: "On-screen text", hint: "Caption suggestions from the source" },
      { key: "cta", label: "CTA", hint: "What to do next" },
    ],
  },
  {
    id: "x",
    label: "X",
    hint: "Punchy post, thread when the source supports it",
    fields: [
      { key: "post", label: "Post", hint: "Concise, publish-ready" },
      { key: "thread", label: "Thread", hint: "Used when the excerpt has more than one beat", optional: true },
      { key: "cta", label: "CTA / question", hint: "When a reply prompt fits", optional: true },
    ],
  },
  {
    id: "linkedin",
    label: "LinkedIn",
    hint: "Professional insight from the source",
    fields: [
      { key: "opening", label: "Opening", hint: "Strong first line" },
      { key: "insight", label: "Insight", hint: "The core claim from the source" },
      { key: "supportingPoints", label: "Supporting points", hint: "Only what the source supports" },
      { key: "discussionPrompt", label: "Discussion prompt", hint: "Closing question" },
    ],
  },
  {
    id: "instagram",
    label: "Instagram",
    hint: "Line-broken caption with tags",
    fields: [
      { key: "hook", label: "Opening hook", hint: "First line" },
      { key: "body", label: "Body", hint: "Source-backed middle" },
      { key: "cta", label: "CTA", hint: "What to do next" },
      { key: "hashtags", label: "Hashtags", hint: "Drawn from the source language" },
      { key: "caption", label: "Full caption", hint: "Hook, body, CTA, and tags together" },
    ],
  },
  {
    id: "youtube",
    label: "YouTube Shorts",
    hint: "Short spoken structure",
    fields: [
      { key: "hook", label: "Hook", hint: "Opening line" },
      { key: "spokenScript", label: "Spoken script", hint: "Tight 20–30s read" },
      { key: "onScreenText", label: "Visual / on-screen", hint: "Suggestions from the source" },
      { key: "cta", label: "CTA", hint: "What to do next" },
    ],
  },
];

export function isPlatformId(value: unknown): value is PlatformId {
  return typeof value === "string" && (PLATFORM_IDS as readonly string[]).includes(value);
}

export function getPlatform(id: PlatformId): PlatformDefinition {
  const match = PLATFORMS.find((platform) => platform.id === id);
  if (!match) {
    throw new Error(`Unknown platform: ${id}`);
  }
  return match;
}

export function normalizePlatforms(value: unknown): PlatformId[] {
  if (!Array.isArray(value)) {
    return [...PLATFORM_IDS];
  }
  const selected = value.filter(isPlatformId);
  return selected.length > 0 ? [...new Set(selected)] : [...PLATFORM_IDS];
}
