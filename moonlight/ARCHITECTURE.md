# Moonlight Architecture

Moonlight is an AI bedtime story platform with payments, account libraries, asynchronous story/audio fulfillment, and admin operations.

## Main Components

- **Next.js App Router**: user-facing pages, admin pages, and API routes.
- **Supabase Auth + Database**: user accounts, orders, stories, subscriptions, feedback, and admin runtime flags.
- **Stripe**: checkout, subscription, portal, and webhook-driven payment events.
- **OpenAI**: generates story text and optional safety review decisions.
- **ElevenLabs**: converts story text into audio.
- **Supabase Storage**: stores generated audio files.
- **Admin Dashboard**: monitors orders, retries fulfillment, toggles story review, handles feedback, and marks operational issues fixed.

## Data Flow Diagram

```mermaid
flowchart TD
  A[Parent fills order form] --> B[Next.js API: /api/orders]
  B --> C{Signed in with credits?}
  C -- Yes --> D[Create paid order]
  C -- No --> E[Stripe Checkout]
  E --> F[Stripe Webhook]
  F --> D
  D --> G[fulfillOrder]
  G --> H[OpenAI story generation]
  H --> I{Story review enabled?}
  I -- Yes --> J[Safety review]
  J -- Flagged --> K[pending_review + admin email]
  J -- Safe --> L[Insert story row]
  I -- No --> L
  L --> M[Consume quota]
  M --> N{ElevenLabs configured?}
  N -- Yes --> O[Generate audio]
  O --> P[Upload MP3 to Supabase Storage]
  P --> Q[Mark order ready]
  N -- No --> Q
  Q --> R[Send story ready email]
  R --> S[Parent library]
  K --> T[Admin dashboard action]
```

## Operational Flow

```mermaid
flowchart LR
  A[Admin Dashboard] --> B[Priority Queue]
  B --> C[Open Order]
  C --> D[Approve]
  C --> E[Retry]
  C --> F[Manual Upload]
  C --> G[Mark Fixed]
  A --> H[Story Review Toggle]
  A --> I[User Feedback Table]
```

## Design Notes

- Fulfillment is intentionally two-phase: text first, audio second. This allows users to read text even if audio fails.
- Orders are stateful and retryable. Admin tools exist because AI/audio integrations can fail asynchronously.
- Some schema decisions are pragmatic for beta speed. A later 3NF migration plan exists, but production stability is prioritized over destructive purity.
