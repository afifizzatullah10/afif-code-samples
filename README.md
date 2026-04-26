# Afif Izzatullah - Code Samples

This repository contains selected, public-safe code samples from two private projects. Secrets, environment files, deployment configuration, generated build output, and private data have been excluded.

## Samples

### 1. Moonlight Bedtime Stories AI
A full-stack AI product sample showing product architecture, authentication, Stripe payments, Supabase data modeling, asynchronous fulfillment, admin operations, migrations, and recovery-oriented engineering.

Start here:
- `moonlight/ARCHITECTURE.md`
- `moonlight/lib/fulfillOrder.ts`
- `moonlight/app/api/orders/route.ts`
- `moonlight/app/admin/page.tsx`
- `moonlight/supabase/schema.sql`

### 2. Solyns AI Form
A focused frontend + AI workflow sample for building, sharing, answering, and analyzing AI-assisted research/forms.

Start here:
- `solyns-ai-form/ARCHITECTURE.md`
- `solyns-ai-form/src/pages/StudyBuilder.tsx`
- `solyns-ai-form/src/pages/RespondentForm.tsx`
- `solyns-ai-form/src/hooks/useFormFlow.ts`
- `solyns-ai-form/supabase/functions/conversation/index.ts`

## Development Notes

These samples reflect my approach to full-stack product engineering: start with the user workflow, make the system observable and recoverable, and keep operational tools close to the product. I use modern developer tooling, including AI-assisted workflows, but the included code is curated to show architecture, structure, and implementation decisions.

## Notes For Reviewers

This is a curated code sample repository, not a runnable production deployment. Some imports may reference files intentionally omitted from the public sample. The goal is to show structure, style, and system design rather than provide complete private application source.
