import { NextResponse } from "next/server";
import { isValidOpportunity } from "@/lib/opportunity-schema";
import { normalizePlatforms } from "@/lib/platforms";
import { generateContent, validateSourceText } from "@/lib/recast";
import type { GenerateRequest, Opportunity } from "@/lib/types";

export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as GenerateRequest;
    const sourceText = validateSourceText(body.sourceText);
    const opportunities = Array.isArray(body.opportunities)
      ? body.opportunities.filter((item): item is Opportunity => isValidOpportunity(item))
      : [];

    if (opportunities.length === 0) {
      return NextResponse.json(
        { error: "Select at least one valid opportunity to generate content." },
        { status: 400 },
      );
    }

    const platforms = normalizePlatforms(body.platforms);
    const result = await generateContent(sourceText, opportunities, platforms);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Generation failed.";
    const status = message.includes("at least") || message.includes("required") || message.includes("too long")
      ? 400
      : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
