"use client";

import { useMemo, useState, type ReactNode } from "react";
import { CopyButton } from "@/components/CopyButton";
import { engineLabel, KIND_CLASS, KIND_LABEL } from "@/lib/labels";
import { getPlatform, PLATFORMS, PLATFORM_IDS, type PlatformId } from "@/lib/platforms";
import { SAMPLE_TRANSCRIPT } from "@/lib/sample";
import {
  normalizeAnalyzeOpportunities,
  normalizeGeneratedPackages,
  packageToOpportunity,
  packageToTikTokOutput,
} from "@/lib/opportunity-schema";
import type {
  AnalysisEngine,
  AnalysisResult,
  GeneratedPiece,
  Opportunity,
  OpportunityKind,
} from "@/lib/types";

type Stage = "input" | "review" | "results";

const ANALYZE_STEPS = [
  "Reading the source",
  "Finding topics",
  "Scoring high-value moments",
  "Writing hooks and angles",
];

const GENERATE_STEPS = [
  "Shaping the selected platform format",
  "Writing from the source and opportunity",
  "Keeping claims faithful to the original",
];

export function RecastApp() {
  const [stage, setStage] = useState<Stage>("input");
  const [sourceText, setSourceText] = useState("");
  const [busy, setBusy] = useState<"analyze" | "generate" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [outputs, setOutputs] = useState<GeneratedPiece[]>([]);
  const [analysisEngine, setAnalysisEngine] = useState<AnalysisEngine>("local");
  const [generationEngine, setGenerationEngine] = useState<AnalysisEngine>("local");
  const [filterId, setFilterId] = useState<"all" | string>("all");
  const [selectedPlatforms, setSelectedPlatforms] = useState<PlatformId[]>([...PLATFORM_IDS]);
  const [generatedPlatforms, setGeneratedPlatforms] = useState<PlatformId[]>([]);

  const selected = useMemo(
    () => opportunities.filter((item) => selectedIds.includes(item.id)),
    [opportunities, selectedIds],
  );

  const visibleOutputs = useMemo(
    () => (filterId === "all" ? outputs : outputs.filter((item) => item.opportunityId === filterId)),
    [filterId, outputs],
  );

  const counts = useMemo(() => {
    const base: Record<OpportunityKind, number> = {
      topic: 0,
      moment: 0,
      hook: 0,
      angle: 0,
    };
    for (const item of opportunities) base[item.kind] += 1;
    return base;
  }, [opportunities]);

  async function analyze() {
    setError(null);
    setBusy("analyze");
    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceText }),
      });
      const payload = (await response.json()) as AnalysisResult & { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Analysis failed.");
      }
      const list = normalizeAnalyzeOpportunities(payload);
      if (list.length === 0) {
        throw new Error("Analysis returned no opportunity objects.");
      }
      setOpportunities(list);
      setSelectedIds(list.map((item) => item.id));
      setAnalysisEngine(payload.engine);
      setOutputs([]);
      setFilterId("all");
      setGeneratedPlatforms([]);
      setStage("review");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed.");
    } finally {
      setBusy(null);
    }
  }

  async function generate() {
    if (selected.length === 0) {
      setError("Select at least one opportunity.");
      return;
    }
    if (selectedPlatforms.length === 0) {
      setError("Select at least one platform.");
      return;
    }
    setError(null);
    setBusy("generate");
    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceText,
          opportunities: selected,
          platforms: selectedPlatforms,
        }),
      });
      const payload = (await response.json()) as {
        engine?: AnalysisEngine;
        platforms?: PlatformId[];
        outputs?: GeneratedPiece[];
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error ?? "Generation failed.");
      }
      const packages = normalizeGeneratedPackages(payload);
      const incomingOutputs = payload.outputs ?? [];
      if (packages.length > 0) {
        const fromPackages = packages.map(packageToOpportunity);
        setOpportunities(fromPackages);
        setSelectedIds(fromPackages.map((item) => item.id));
        const tiktokOutputs = packages.map(packageToTikTokOutput);
        const otherOutputs = incomingOutputs.filter((item) => item.platform !== "tiktok");
        setOutputs([...tiktokOutputs, ...otherOutputs]);
      } else {
        setOutputs(incomingOutputs);
      }
      setGeneratedPlatforms(payload.platforms ?? selectedPlatforms);
      setGenerationEngine(payload.engine ?? "local");
      setFilterId("all");
      setStage("results");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed.");
    } finally {
      setBusy(null);
    }
  }

  function toggle(id: string) {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  }

  function reset() {
    setStage("input");
    setSourceText("");
    setError(null);
    setOpportunities([]);
    setSelectedIds([]);
    setOutputs([]);
    setFilterId("all");
    setSelectedPlatforms([...PLATFORM_IDS]);
    setGeneratedPlatforms([]);
  }

  return (
    <div className="relative min-h-full overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-grid opacity-40" />
      <div className="pointer-events-none absolute -top-40 left-1/2 h-[520px] w-[820px] -translate-x-1/2 rounded-full bg-gold/10 blur-3xl" />

      <header className="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6">
        <button type="button" onClick={reset} className="group flex items-center gap-3">
          <Mark />
          <span className="font-serif text-2xl tracking-[0.18em] text-cream">RECAST</span>
        </button>
        <EngineNote
          stage={stage}
          analysisEngine={analysisEngine}
          generationEngine={generationEngine}
        />
      </header>

      <main className="relative z-10 mx-auto w-full max-w-6xl px-6 pb-20">
        <Stepper stage={stage} />

        {error ? (
          <div className="mb-6 rounded-2xl border border-hook/40 bg-hook/10 px-4 py-3 text-sm text-cream">
            {error}
          </div>
        ) : null}

        {stage === "input" ? (
          <Landing
            sourceText={sourceText}
            busy={busy === "analyze"}
            onChange={setSourceText}
            onAnalyze={analyze}
            onSample={() => setSourceText(SAMPLE_TRANSCRIPT)}
          />
        ) : null}

        {stage === "review" ? (
          <Review
            opportunities={opportunities}
            selectedIds={selectedIds}
            selectedPlatforms={selectedPlatforms}
            counts={counts}
            busy={busy === "generate"}
            onToggle={toggle}
            onTogglePlatform={(id) =>
              setSelectedPlatforms((current) =>
                current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
              )
            }
            onSelectAll={() => setSelectedIds(opportunities.map((item) => item.id))}
            onClear={() => setSelectedIds([])}
            onGenerate={generate}
            onBack={() => setStage("input")}
          />
        ) : null}

        {stage === "results" ? (
          <Dashboard
            opportunities={selected}
            outputs={visibleOutputs}
            platforms={generatedPlatforms}
            filterId={filterId}
            onFilter={setFilterId}
            onBack={() => setStage("review")}
            onReset={reset}
          />
        ) : null}
      </main>

      {busy ? (
        <BusyOverlay
          title={busy === "analyze" ? "Analyzing source" : "Generating platform content"}
          steps={busy === "analyze" ? ANALYZE_STEPS : GENERATE_STEPS}
        />
      ) : null}
    </div>
  );
}

function Mark() {
  return (
    <span className="flex h-9 w-9 items-center justify-center rounded-full border border-gold/50 bg-gold/10 text-gold">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path
          d="M3 8a5 5 0 1 0 1.4-3.5"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <path d="M3 3.2v3.1h3.1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    </span>
  );
}

function EngineNote({
  stage,
  analysisEngine,
  generationEngine,
}: {
  stage: Stage;
  analysisEngine: AnalysisEngine;
  generationEngine: AnalysisEngine;
}) {
  if (stage === "input") {
    return (
      <p className="hidden text-xs text-muted sm:block">
        OpenAI when configured · local engine otherwise
      </p>
    );
  }
  return (
    <p className="hidden text-xs text-muted sm:block">
      {stage === "results"
        ? `Generated with ${engineLabel(generationEngine)}`
        : `Analyzed with ${engineLabel(analysisEngine)}`}
    </p>
  );
}

function Stepper({ stage }: { stage: Stage }) {
  const steps = [
    { id: "input", label: "Input" },
    { id: "review", label: "Analyze" },
    { id: "results", label: "Dashboard" },
  ] as const;
  const index = steps.findIndex((step) => step.id === stage);

  return (
    <ol className="mb-10 flex items-center gap-3 text-xs tracking-[0.16em] uppercase text-muted">
      {steps.map((step, stepIndex) => (
        <li key={step.id} className="flex items-center gap-3">
          <span className={stepIndex <= index ? "text-gold" : ""}>
            0{stepIndex + 1} {step.label}
          </span>
          {stepIndex < steps.length - 1 ? <span className="h-px w-8 bg-line" /> : null}
        </li>
      ))}
    </ol>
  );
}

function Landing({
  sourceText,
  busy,
  onChange,
  onAnalyze,
  onSample,
}: {
  sourceText: string;
  busy: boolean;
  onChange: (value: string) => void;
  onAnalyze: () => void;
  onSample: () => void;
}) {
  const chars = sourceText.trim().length;

  return (
    <section className="mx-auto max-w-3xl pt-4">
      <p className="mb-4 text-xs tracking-[0.28em] uppercase text-gold">Content operations engine</p>
      <h1 className="font-serif text-5xl leading-[1.05] text-cream sm:text-6xl">
        Turn one piece of content into an entire content operation.
      </h1>
      <p className="mt-5 max-w-2xl text-base leading-7 text-muted">
        Paste a transcript, essay, or interview. RECAST finds the reusable moments, then writes
        platform-specific posts, hooks, and CTAs you can copy and publish.
      </p>

      <label className="mt-10 block">
        <span className="mb-3 flex items-center justify-between text-sm text-muted">
          Source content
          <span>{chars.toLocaleString()} characters</span>
        </span>
        <textarea
          value={sourceText}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
              event.preventDefault();
              onAnalyze();
            }
          }}
          placeholder="Paste a podcast transcript, YouTube script, newsletter, or long-form draft…"
          className="min-h-[280px] w-full resize-y rounded-3xl border border-line bg-panel/90 px-5 py-4 font-mono text-sm leading-7 text-cream outline-none ring-gold/30 placeholder:text-muted/70 focus:border-gold/50 focus:ring-2"
        />
      </label>

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
        <button
          type="button"
          onClick={onAnalyze}
          disabled={busy}
          className="rounded-full bg-gold px-7 py-3 text-sm font-semibold text-ink transition hover:bg-gold-soft disabled:opacity-60"
        >
          Analyze Content
        </button>
        <button
          type="button"
          onClick={onSample}
          className="rounded-full border border-line px-5 py-3 text-sm text-cream/80 transition hover:border-gold/40 hover:text-gold"
        >
          Load sample transcript
        </button>
        <p className="text-xs text-muted sm:ml-auto">Ctrl/⌘ + Enter to analyze</p>
      </div>
    </section>
  );
}

function Review({
  opportunities,
  selectedIds,
  selectedPlatforms,
  counts,
  busy,
  onToggle,
  onTogglePlatform,
  onSelectAll,
  onClear,
  onGenerate,
  onBack,
}: {
  opportunities: Opportunity[];
  selectedIds: string[];
  selectedPlatforms: PlatformId[];
  counts: Record<OpportunityKind, number>;
  busy: boolean;
  onToggle: (id: string) => void;
  onTogglePlatform: (id: PlatformId) => void;
  onSelectAll: () => void;
  onClear: () => void;
  onGenerate: () => void;
  onBack: () => void;
}) {
  return (
    <section>
      <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="font-serif text-4xl text-cream">Content opportunities</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
            {opportunities.length} opportunities · {counts.topic}{" "}
            {counts.topic === 1 ? "topic" : "topics"} · {counts.moment}{" "}
            {counts.moment === 1 ? "moment" : "moments"} · {counts.hook}{" "}
            {counts.hook === 1 ? "hook" : "hooks"} · {counts.angle}{" "}
            {counts.angle === 1 ? "angle" : "angles"}. Select what deserves oxygen, then generate.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={onBack} className="rounded-full border border-line px-4 py-2 text-sm text-muted hover:text-cream">
            Edit source
          </button>
          <button type="button" onClick={onSelectAll} className="rounded-full border border-line px-4 py-2 text-sm text-muted hover:text-cream">
            Select all
          </button>
          <button type="button" onClick={onClear} className="rounded-full border border-line px-4 py-2 text-sm text-muted hover:text-cream">
            Clear
          </button>
          <button
            type="button"
            onClick={onGenerate}
            disabled={busy || selectedIds.length === 0 || selectedPlatforms.length === 0}
            className="rounded-full bg-gold px-5 py-2 text-sm font-semibold text-ink hover:bg-gold-soft disabled:opacity-50"
          >
            Generate {selectedIds.length} selected
          </button>
        </div>
      </div>

      <div className="mb-6">
        <p className="mb-3 text-xs tracking-[0.2em] uppercase text-muted">Generate for</p>
        <div className="flex flex-wrap gap-2">
          {PLATFORMS.map((platform) => (
            <FilterChip
              key={platform.id}
              active={selectedPlatforms.includes(platform.id)}
              onClick={() => onTogglePlatform(platform.id)}
            >
              {platform.label}
            </FilterChip>
          ))}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {opportunities.map((opportunity) => {
          const active = selectedIds.includes(opportunity.id);
          return (
            <button
              key={opportunity.id}
              type="button"
              onClick={() => onToggle(opportunity.id)}
              className={`rounded-3xl border p-5 text-left transition ${
                active
                  ? "border-gold/45 bg-panel shadow-[0_0_0_1px_rgba(212,160,83,0.12)]"
                  : "border-line bg-panel/50 opacity-70 hover:opacity-100"
              }`}
            >
              <div className="mb-3 flex items-center justify-between gap-3">
                <span className={`badge ${KIND_CLASS[opportunity.kind]}`}>
                  {KIND_LABEL[opportunity.kind]}
                </span>
                <span className="text-xs text-muted">{active ? "Selected" : "Tap to include"}</span>
              </div>
              <h2 className="font-serif text-2xl leading-snug text-cream">{opportunity.title}</h2>
              <p className="mt-3 text-sm leading-6 text-cream/75">“{opportunity.excerpt}”</p>
              <p className="mt-4 text-sm leading-6 text-muted">
                <span className="text-gold">Why it is valuable. </span>
                {opportunity.whyValuable}
              </p>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function Dashboard({
  opportunities,
  outputs,
  platforms,
  filterId,
  onFilter,
  onBack,
  onReset,
}: {
  opportunities: Opportunity[];
  outputs: GeneratedPiece[];
  platforms: PlatformId[];
  filterId: "all" | string;
  onFilter: (id: "all" | string) => void;
  onBack: () => void;
  onReset: () => void;
}) {
  return (
    <section className="space-y-10">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="font-serif text-4xl text-cream">Results dashboard</h1>
          <p className="mt-2 text-sm text-muted">
            Copy any output. Filter by opportunity. Generated for{" "}
            {platforms.map((id) => getPlatform(id).label).join(", ") || "the selected platforms"}.
          </p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={onBack} className="rounded-full border border-line px-4 py-2 text-sm text-muted hover:text-cream">
            Change selection
          </button>
          <button type="button" onClick={onReset} className="rounded-full border border-line px-4 py-2 text-sm text-muted hover:text-cream">
            New source
          </button>
        </div>
      </div>

      <div>
        <h2 className="mb-4 text-xs tracking-[0.2em] uppercase text-muted">Opportunities</h2>
        <div className="flex flex-nowrap gap-3 overflow-x-auto pb-2">
          <FilterChip active={filterId === "all"} onClick={() => onFilter("all")}>
            All
          </FilterChip>
          {opportunities.map((opportunity) => (
            <FilterChip
              key={opportunity.id}
              active={filterId === opportunity.id}
              onClick={() => onFilter(opportunity.id)}
            >
              {opportunity.title}
            </FilterChip>
          ))}
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {opportunities
            .filter((item) => filterId === "all" || item.id === filterId)
            .map((opportunity) => (
              <article key={opportunity.id} className="rounded-2xl border border-line bg-panel p-4">
                <span className={`badge ${KIND_CLASS[opportunity.kind]}`}>
                  {KIND_LABEL[opportunity.kind]}
                </span>
                <h3 className="mt-3 font-serif text-xl text-cream">{opportunity.title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted">{opportunity.whyValuable}</p>
              </article>
            ))}
        </div>
      </div>

      {platforms.map((platformId) => {
        const platform = getPlatform(platformId);
        const platformOutputs = outputs.filter((output) => output.platform === platformId);
        return (
          <div key={platformId} className="space-y-8">
            <div>
              <h2 className="text-xs tracking-[0.2em] uppercase text-muted">{platform.label}</h2>
              <p className="mt-1 text-xs text-muted">{platform.hint}</p>
            </div>
            {platform.fields.map((field) => {
              const items = platformOutputs
                .map((output) => ({
                  id: `${output.opportunityId}-${platformId}-${field.key}`,
                  eyebrow: output.opportunityTitle,
                  body: output.fields[field.key] ?? "",
                }))
                .filter((item) => item.body.trim().length > 0);
              if (items.length === 0) return null;
              return (
                <PlatformSection
                  key={`${platformId}-${field.key}`}
                  title={field.label}
                  hint={field.hint}
                  items={items}
                />
              );
            })}
          </div>
        );
      })}
    </section>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 max-w-[260px] truncate rounded-full px-4 py-2 text-left text-xs ${
        active ? "bg-gold text-ink" : "border border-line text-muted hover:text-cream"
      }`}
    >
      {children}
    </button>
  );
}

function PlatformSection({
  title,
  hint,
  items,
}: {
  title: string;
  hint: string;
  items: Array<{ id: string; eyebrow: string; body: string }>;
}) {
  return (
    <section>
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <h2 className="font-serif text-3xl text-cream">{title}</h2>
          <p className="mt-1 text-xs text-muted">{hint}</p>
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {items.map((item) => (
          <article key={item.id} className="rounded-3xl border border-line bg-panel p-5">
            <div className="mb-3 flex items-start justify-between gap-3">
              <p className="text-xs tracking-[0.14em] uppercase text-gold">{item.eyebrow}</p>
              <CopyButton text={item.body} />
            </div>
            <pre className="whitespace-pre-wrap font-sans text-sm leading-7 text-cream/90">{item.body}</pre>
          </article>
        ))}
      </div>
    </section>
  );
}

function BusyOverlay({ title, steps }: { title: string; steps: string[] }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/70 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-3xl border border-line bg-panel px-8 py-8">
        <p className="text-xs tracking-[0.22em] uppercase text-gold">RECAST</p>
        <h2 className="mt-2 font-serif text-3xl text-cream">{title}</h2>
        <ul className="mt-6 space-y-3">
          {steps.map((step) => (
            <li key={step} className="flex items-center gap-3 text-sm text-muted">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-gold" />
              {step}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
