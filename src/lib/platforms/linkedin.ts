import type { Opportunity } from "@/lib/types";
import { attentionHook, clip, overlaps, sourceClaim, sourceClauses } from "./draft";

export function generateLinkedIn(
  _sourceText: string,
  opportunity: Opportunity,
): Record<string, string> {
  const claim = sourceClaim(opportunity);
  const opening = attentionHook(opportunity);
  const clauses = sourceClauses(claim)
    .filter((clause) => !overlaps(clause, opening))
    .slice(0, 2);
  const support = [...clauses, opportunity.whyValuable].filter(
    (point) => point && !overlaps(point, opening),
  );
  const points = (support.length > 0 ? support : [claim, opportunity.whyValuable])
    .slice(0, 3)
    .map((point) => `• ${clip(point, 180)}`);

  const prompt = claim.includes("?")
    ? clip(claim, 160)
    : `Where have you seen this show up in your own work? The source claim: ${clip(claim, 120)}`;

  return {
    opening,
    insight: claim,
    supportingPoints: points.join("\n"),
    discussionPrompt: prompt,
  };
}
