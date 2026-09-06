# RECAST

AI content operations engine for creators. Paste one long-form source. Identify reusable opportunities. Generate platform-specific drafts.

## Stack

Next.js (App Router) + TypeScript + Tailwind. No auth, payments, or social APIs.

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## OpenAI integration

RECAST calls the OpenAI Chat Completions API when `OPENAI_API_KEY` is set. Copy `.env.example` to `.env.local` and add a key.

Without a key, the local analysis engine still extracts topics, moments, hooks, and angles from the source text and drafts platform content from those excerpts. It does not invent a fake API.

```
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini
```
