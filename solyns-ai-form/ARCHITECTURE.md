# Solyns AI Form Architecture

Solyns AI Form is a form/research workflow product for creating AI-assisted studies, collecting responses, and generating insights.

## Main Components

- **React + Vite frontend**: study builder, respondent experience, dashboard, and results pages.
- **Builder components**: question list, content editor, settings, and element picker.
- **Respondent flow**: guided form answering, chat-style experience, progress tracking, voice input.
- **Supabase**: persistence and edge functions for AI workflows.
- **AI edge functions**: guide generation, conversation, transcription, insights, and completion handling.
- **Exports/analytics**: spreadsheet generation and response summaries.

## Data Flow Diagram

```mermaid
flowchart TD
  A[Researcher creates study] --> B[Study Builder]
  B --> C[Questions + guide saved]
  C --> D[Share respondent link]
  D --> E[Respondent form/chat]
  E --> F[Responses captured]
  F --> G[Supabase Edge Functions]
  G --> H[AI follow-up / guide / insights]
  H --> I[Results dashboard]
  I --> J[Spreadsheet exports]
```

## Component Flow

```mermaid
flowchart LR
  A[Dashboard] --> B[CreateStudy]
  B --> C[StudyBuilder]
  C --> D[QuestionList]
  C --> E[QuestionContentEditor]
  C --> F[QuestionSettings]
  G[RespondentForm] --> H[QuestionCard]
  G --> I[useFormFlow]
  J[RespondentChat] --> K[useConversation]
  J --> L[VoiceRecorder]
  M[StudyResults] --> N[ResponsesSpreadsheet]
  M --> O[ExportButtons]
```

## Design Notes

- The builder separates question structure from respondent presentation.
- Hooks encapsulate flow state (`useFormFlow`) and conversational state (`useConversation`).
- Edge functions isolate AI calls from the client, keeping API keys server-side.
- Export utilities keep reporting logic out of UI components.
