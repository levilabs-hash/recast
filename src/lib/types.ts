import type { PlatformId } from "./platforms/catalog";

export type { PlatformId };

export type OpportunityKind = "topic" | "moment" | "hook" | "angle";

export type AnalysisEngine = "openai" | "local";

export interface Opportunity {
  id: string;
  kind: OpportunityKind;
  title: string;
  excerpt: string;
  whyValuable: string;
}

export interface AnalysisResult {
  engine: AnalysisEngine;
  opportunities: Opportunity[];
}

export interface GeneratedPiece {
  opportunityId: string;
  opportunityTitle: string;
  opportunityKind: OpportunityKind;
  platform: PlatformId;
  fields: Record<string, string>;
}

export interface GenerationResult {
  engine: AnalysisEngine;
  platforms: PlatformId[];
  outputs: GeneratedPiece[];
}

export interface AnalyzeRequest {
  sourceText: string;
}

export interface GenerateRequest {
  sourceText: string;
  opportunities: Opportunity[];
  platforms?: PlatformId[];
}
