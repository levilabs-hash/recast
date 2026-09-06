import type { Opportunity } from "@/lib/types";
import { draftCta, draftHashtags, draftHook, sourceClaim } from "./draft";

export function generateInstagram(
  sourceText: string,
  opportunity: Opportunity,
): Record<string, string> {
  const hook = draftHook(opportunity, opportunity.id.length);
  const body = [sourceClaim(opportunity), "", opportunity.whyValuable].join("\n");
  const cta = draftCta(opportunity);
  const hashtags = draftHashtags(opportunity, sourceText).join(" ");
  const caption = [hook, "", body, "", cta, "", hashtags].join("\n");

  return { hook, body, cta, hashtags, caption };
}
