import { NextResponse } from "next/server";
import { analyzeContent, validateSourceText } from "@/lib/recast";
import type { AnalyzeRequest } from "@/lib/types";

export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as AnalyzeRequest;
    const sourceText = validateSourceText(body.sourceText);
    const result = await analyzeContent(sourceText);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Analysis failed.";
    const status = message.includes("at least") || message.includes("required") || message.includes("too long")
      ? 400
      : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
