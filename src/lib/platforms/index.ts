import type { GeneratedPiece, Opportunity } from "@/lib/types";
import { getPlatform, type PlatformId } from "./catalog";
import { generateInstagram } from "./instagram";
import { generateLinkedIn } from "./linkedin";
import { generateTikTok } from "./tiktok";
import { generateX } from "./x";
import { generateYouTube } from "./youtube";

export { getPlatform, isPlatformId, normalizePlatforms, PLATFORMS, PLATFORM_IDS } from "./catalog";
export type { PlatformDefinition, PlatformField, PlatformId } from "./catalog";

type PlatformGenerator = (
  sourceText: string,
  opportunity: Opportunity,
) => Record<string, string>;

const GENERATORS: Record<PlatformId, PlatformGenerator> = {
  tiktok: generateTikTok,
  x: generateX,
  linkedin: generateLinkedIn,
  instagram: generateInstagram,
  youtube: generateYouTube,
};

export function generateForPlatform(
  platform: PlatformId,
  sourceText: string,
  opportunity: Opportunity,
): Record<string, string> {
  return GENERATORS[platform](sourceText, opportunity);
}

export function generatePlatformOutputs(
  sourceText: string,
  opportunities: Opportunity[],
  platforms: PlatformId[],
): GeneratedPiece[] {
  return opportunities.flatMap((opportunity) =>
    platforms.map((platform) => {
      const fields = generateForPlatform(platform, sourceText, opportunity);
      const definition = getPlatform(platform);
      for (const field of definition.fields) {
        if (!field.optional && !fields[field.key]?.trim()) {
          fields[field.key] = fields[field.key] ?? "";
        }
      }
      return {
        opportunityId: opportunity.id,
        opportunityTitle: opportunity.title,
        opportunityKind: opportunity.kind,
        platform,
        fields,
      };
    }),
  );
}

export function registerPlatform(id: PlatformId, generator: PlatformGenerator): void {
  GENERATORS[id] = generator;
}
