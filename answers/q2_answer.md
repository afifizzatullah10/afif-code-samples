For code examples, I created a public-safe repo with selected files from two private projects:

https://github.com/afifizzatullah10/afif-code-samples

I included two samples because they show different parts of my engineering work:

## 1. Moonlight Bedtime Stories AI

**Tech stack:** Next.js + Supabase + Stripe + OpenAI + ElevenLabs

This is the stronger full-stack systems example. It shows authentication, Stripe payments, Supabase data modeling, asynchronous AI/story fulfillment, admin operations, retries/failure handling, and migration work.

**Start here:**

- `moonlight/ARCHITECTURE.md` — system overview with Mermaid data-flow diagrams
- `moonlight/lib/fulfillOrder.ts` — two-phase async fulfillment (text → audio), retryable
- `moonlight/app/api/orders/route.ts` — order creation API
- `moonlight/app/admin/page.tsx` — operational dashboard
- `moonlight/supabase/schema.sql` — DB schema

## 2. Solyns AI Form

**Tech stack:** React + Vite + Supabase Edge Functions

This is a more focused frontend/product workflow example. It shows form-building UX, respondent flows, AI-assisted conversation, response handling, and export/analysis logic.

**Start here:**

- `solyns-ai-form/ARCHITECTURE.md` — frontend + AI workflow architecture
- `solyns-ai-form/src/pages/StudyBuilder.tsx` — researcher study creation
- `solyns-ai-form/src/pages/RespondentForm.tsx` — chat-style respondent flow
- `solyns-ai-form/src/hooks/useFormFlow.ts` — flow state management
- `solyns-ai-form/supabase/functions/conversation/index.ts` — AI conversation edge function

The original repos are private, so this sample excludes secrets, env files, private deployment configs, and generated build output. It's meant to show how I structure code, think about system boundaries, and make product/engineering tradeoffs.

To be transparent — these are real working products I built while learning, iterating, and making practical tradeoffs. They're not perfect, and I'm still leveling up as an engineer. I'd be eager to learn from you and the Groupon team's standards on scaling product engineering and building with operational rigor.
