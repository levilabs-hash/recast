import type { Opportunity } from "@/lib/types";
import {
  attentionHook,
  videoCaptions,
  expandFromSource,
  insightFromSource,
  specificCta,
  takeawayFromSource,
} from "./draft";

export function generateTikTok(
  _sourceText: string,
  opportunity: Opportunity,
): Record<string, string> {
  const hook = attentionHook(opportunity);
  const beat1 = expandFromSource(opportunity, hook);
  const beat2 = insightFromSource(opportunity);
  const beat3 = takeawayFromSource(opportunity, hook, beat1);
  const cta = specificCta(opportunity, hook);

  const spokenScript = [
    `HOOK (0-2s): ${hook}`,
    `BEAT 1 (2-10s): ${beat1}`,
    `BEAT 2 (10-22s): ${beat2}`,
    `BEAT 3 (22-32s): ${beat3}`,
    `CTA (32-38s): ${cta}`,
  ].join("\n");

  return {
    hook,
    spokenScript,
    onScreenText: videoCaptions(opportunity, hook),
    cta,
  };
}
