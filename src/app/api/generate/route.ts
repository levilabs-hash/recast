import { NextResponse } from "next/server";
import { generateContent, validateSourceText } from "@/lib/recast";
import type { GenerateRequest, Opportunity, OpportunityKind } from "@/lib/types";

export const maxDuration = 60;

const KINDS: OpportunityKind[] = ["topic", "moment", "hook", "angle"];

function isOpportunity(value: unknown): value is Opportunity {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === "string" &&
    KINDS.includes(record.kind as OpportunityKind) &&
    typeof record.title === "string" &&
    typeof record.excerpt === "string" &&
    typeof record.whyValuable === "string"
  );
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as GenerateRequest;
    const sourceText = validateSourceText(body.sourceText);
    const opportunities = Array.isArray(body.opportunities)
      ? body.opportunities.filter(isOpportunity)
      : [];

    if (opportunities.length === 0) {
      return NextResponse.json(
        { error: "Select at least one valid opportunity to generate content." },
        { status: 400 },
      );
    }

    const result = await generateContent(sourceText, opportunities);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Generation failed.";
    const status = message.includes("at least") || message.includes("required") || message.includes("too long")
      ? 400
      : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
