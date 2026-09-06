import type { AnalysisEngine, OpportunityKind } from "./types";

export const KIND_LABEL: Record<OpportunityKind, string> = {
  topic: "Topic",
  moment: "Moment",
  hook: "Hook",
  angle: "Angle",
};

export const KIND_CLASS: Record<OpportunityKind, string> = {
  topic: "badge-topic",
  moment: "badge-moment",
  hook: "badge-hook",
  angle: "badge-angle",
};

export function engineLabel(engine: AnalysisEngine): string {
  return engine === "openai" ? "OpenAI" : "Local engine";
}
