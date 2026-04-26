# Q3: Most Advanced Use of AI in My Development Workflow

I use AI as a structured collaborator across the full development lifecycle: research, customer discovery, architecture, implementation, testing, operations, and shipping. The most valuable part is not one-off prompting, but maintaining persistent project context so agents can help inside the real system instead of generating isolated snippets.

## 1. Planning and Research

Before building, I use Claude/Gemini Deep Research Agent for structured research: market mapping, competitor scans, ICP hypotheses, and product scoping. Solyns AI was scoped this way before I wrote code.

During my AlphaGraphics internship, I also built a recurring deep-research routine: every morning, an AI-assisted workflow pulled fresh information about the company, competitors, and industry trends, then produced a short TLDR. Five minutes of reading replaced roughly two hours of manual research.

## 2. Customer Discovery

For online customer meetings, I use tools like Granola or Read AI to capture transcripts, then use Claude/Gemini to organize insights by speaker, topic, pain point, and follow-up action.

For offline conversations, with permission, I record on iPhone, upload to Drive, and summarize the transcript into structured notes. This helped compress customer discovery synthesis for Solyns from days into hours.

## 3. Building With Persistent Context

For each project, I keep context files such as:

- `plan.md` — sprints, scope, open questions
- `architecture.md` — system overview and data flows
- `ai_plan.md` — project-specific agent instructions
- `datamodel.md` — schema design checklist for normalization, audit metadata, and indexing

These documents serve both humans and AI agents. They preserve architecture, conventions, and decision history, so each session starts with context instead of from scratch.

I choose tools based on the task:

- Claude/Gemini for planning and research
- Cursor/Codex for codebase-aware implementation and refactoring
- GitHub/Codex-style review loops for async code review
- n8n for repeatable automation workflows

At AlphaGraphics, I built n8n + OpenAI automations for sales and finance teams. Instead of replacing their existing tools, I integrated with their email, CRM, Word, Excel, and VBA workflows. One invoicing process went from about 7 hours to 30 minutes.

## 4. Operations and Reliability

In Moonlight, I used AI-assisted development to build admin tooling around real operational problems: story fulfillment, audio generation failures, retry flows, safety review toggles, feedback collection, and manual recovery paths.

Beyond admin UI, I run AI agents for monitoring: alerts when an API fails (OpenAI, ElevenLabs), automatic safety review on stories before delivery, and token usage dashboards so I don't get surprised by billing spikes.

The pattern is: when a production issue appears, I use agents to trace logs, inspect code paths, propose fixes, and update admin workflows. I still review the diff, run checks, and own the final shipping decision.

## 5. Testing and Failure Thinking

I use AI to generate edge-case checklists and failure scenarios. I often ask:

> What happens if OpenAI fails? What if ElevenLabs fails? What does the user see? What does admin do next?

That has pushed me to design more resilient flows: fallback states, retry buttons, admin visibility, and clearer user messaging.

## 6. Shipping

I usually ship with Vercel and Supabase because they let me move quickly while keeping deployment, database, auth, and logs simple. After shipping, AI agents watch real orders and I iterate with Cursor based on production data.

## Where I'm Still Leveling Up

I do not yet run fully autonomous multi-agent production pipelines. I still drive the agents and make the final engineering decisions. But this is exactly why I'm excited about Groupon: I'd love to learn from a team operating agentic workflows at much larger scale and with higher engineering rigor.