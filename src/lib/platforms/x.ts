import type { Opportunity } from "@/lib/types";
import { clip, draftCta, draftHook, sourceClaim, sourceClauses } from "./draft";

export function generateX(
  _sourceText: string,
  opportunity: Opportunity,
): Record<string, string> {
  const hook = draftHook(opportunity, opportunity.id.length + 1);
  const claim = sourceClaim(opportunity);
  const clauses = sourceClauses(claim);
  const wantsQuestion = opportunity.kind === "hook" || /\?/.test(claim) || opportunity.kind === "angle";
  const cta = wantsQuestion ? draftCta(opportunity) : "";

  const post = clip(cta ? `${hook}\n\n${clip(claim, 160)}\n\n${cta}` : `${hook}\n\n${clip(claim, 200)}`, 280);

  const thread =
    clauses.length >= 2
      ? [
          `1/${Math.min(clauses.length, 3) + 1} ${hook}`,
          ...clauses.slice(0, 3).map((clause, index) => `${index + 2}/${Math.min(clauses.length, 3) + 1} ${clip(clause, 240)}`),
        ].join("\n\n")
      : "";

  return { post, thread, cta };
}
