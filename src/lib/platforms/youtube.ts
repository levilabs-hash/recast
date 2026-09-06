import type { Opportunity } from "@/lib/types";
import { clip, draftCta, draftHook, onScreenSuggestions, sourceClaim } from "./draft";

export function generateYouTube(
  _sourceText: string,
  opportunity: Opportunity,
): Record<string, string> {
  const hook = draftHook(opportunity, opportunity.id.length + 2);
  const claim = sourceClaim(opportunity);
  const cta = draftCta(opportunity);

  const spokenScript = [
    `HOOK (0-2s): ${hook}`,
    `LINE (2-18s): ${clip(claim, 200)}`,
    `HOLD (18-24s): ${clip(opportunity.whyValuable, 140)}`,
    `CTA (24-30s): ${cta}`,
  ].join("\n");

  return {
    hook,
    spokenScript,
    onScreenText: onScreenSuggestions(opportunity),
    cta,
  };
}
