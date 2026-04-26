import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { generateJsonWithFallback } from "../_shared/ai.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    // Auth: use caller's JWT to verify form ownership via RLS
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: req.headers.get("Authorization")! } } }
    )

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser()
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const { form_id } = await req.json()
    if (!form_id) {
      return new Response(JSON.stringify({ error: "Missing form_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    )

    // Ownership check through RLS
    const { data: form, error: formError } = await supabaseClient
      .from("forms")
      .select("*")
      .eq("id", form_id)
      .single()

    if (formError || !form) {
      console.error("Form lookup failed:", formError?.message)
      return new Response(JSON.stringify({ error: "Form not found or access denied" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    // Fetch responses with transcript data (completed or in-progress; admin — no RLS on responses)
    const { data: rawResponses, error: responsesError } = await supabaseAdmin
      .from("responses")
      .select("*")
      .eq("form_id", form_id)
      .in("status", ["completed", "in_progress"])
      .order("created_at", { ascending: true })

    if (responsesError) {
      console.error("Responses fetch error:", responsesError.message)
      return new Response(JSON.stringify({ error: "Failed to fetch responses" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const responses = (rawResponses ?? []).filter((r: Record<string, unknown>) => {
      const t = r.transcript
      return Array.isArray(t) && t.length > 0
    })

    if (responses.length === 0) {
      return new Response(
        JSON.stringify({
          error: "No responses with transcript data to analyze (need at least one started session with answers).",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      )
    }

    const hasOpenAI = !!Deno.env.get("OPENAI_API_KEY")?.trim()
    const hasGemini = !!Deno.env.get("GEMINI_API_KEY")?.trim()
    if (!hasOpenAI && !hasGemini) {
      return new Response(JSON.stringify({ error: "No AI provider configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    // ── Build the questions context so the LLM understands the guide structure ──
    const questions = form.discussion_guide?.questions ?? []
    const questionsBlock = questions.length > 0
      ? `FORM QUESTIONS:\n${questions.map((q: { id: string; text: string; type: string }, i: number) => `${i + 1}. [${q.type}] ${q.text}`).join("\n")}\n\n`
      : ""

    const language = (form.language as string | undefined) ?? "en"
    const languageName = language === "id" ? "Bahasa Indonesia" : "English"

    // ── Build per-respondent transcript blocks ──
    const allTranscripts = responses.map((r: Record<string, unknown>, idx: number) => {
      const transcript = (r.transcript as Array<{ role: string; content: string; source?: string }>) || []
      const lines: string[] = []
      for (const msg of transcript) {
        const speaker = msg.role === "ai" ? "Interviewer" : "Respondent"
        const tag = msg.source === "ai_follow_up" ? " [AI follow-up]" : ""
        lines.push(`${speaker}${tag}: ${msg.content}`)
      }
      const summary = r.ai_summary ? `Per-response summary: ${r.ai_summary}` : ""
      return `--- Respondent ${idx + 1} ---\n${summary}\n\n${lines.join("\n")}`
    }).join("\n\n")

    const prompt = `You are a senior UX research analyst. You have ${responses.length} form response(s) with transcript data from a study about: "${form.objective}"

${questionsBlock}TRANSCRIPTS:
${allTranscripts}

Write all analyst text (theme names & descriptions, executive summary, recommendation titles & descriptions) in ${languageName}. Keep verbatim quotes in the original language the respondent used — do NOT translate them.

Analyze ALL responses and produce:

1. **Top Themes** (3-6): recurring patterns and sentiments across respondents. For each:
   - A concise theme name
   - 1-2 sentence description explaining the pattern
   - How many respondents expressed this theme (be accurate — count carefully)
   - 2-3 verbatim quotes that best illustrate it (with "Respondent N" attribution)
   Prioritize themes by frequency and impact.

2. **Executive Summary** (3-5 sentences): the most important takeaways a product manager or decision-maker needs to know. Be specific — reference actual numbers and sentiments, not platitudes.

3. **Recommendations** (2-4): concrete, actionable next steps based on the data. Each should have a short title and a 1-2 sentence description explaining what to do and why.

Respond ONLY with valid JSON (no markdown, no explanation outside JSON):
{
  "themes": [
    {
      "name": "Theme Name",
      "description": "Pattern description",
      "respondent_count": 3,
      "quotes": [
        { "text": "exact quote from transcript", "respondent": "Respondent 2" }
      ]
    }
  ],
  "executive_summary": "3-5 sentence summary",
  "recommendations": [
    { "title": "Recommendation title", "description": "What to do and why" }
  ]
}`

    const result = await generateJsonWithFallback(
      [{ role: "user", parts: [{ text: prompt }] }],
      { temperature: 0.3, topP: 0.9 }
    )

    if (!result.ok) {
      console.error("generate-insights AI failure:", result.logDetail)
      return new Response(
        JSON.stringify({ error: result.userMessage }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    const insights = result.data as Record<string, unknown>

    // ── Persist insights ──
    await supabaseAdmin
      .from("form_insights")
      .delete()
      .eq("form_id", form_id)

    const insightRows = []
    if (insights.themes) {
      insightRows.push({
        form_id,
        insight_type: "themes",
        content: { themes: insights.themes },
        response_count: responses.length,
      })
    }
    if (insights.executive_summary) {
      insightRows.push({
        form_id,
        insight_type: "summary",
        content: { executive_summary: insights.executive_summary },
        response_count: responses.length,
      })
    }
    if (insights.recommendations) {
      insightRows.push({
        form_id,
        insight_type: "recommendations",
        content: { recommendations: insights.recommendations },
        response_count: responses.length,
      })
    }

    if (insightRows.length > 0) {
      const { error: insertError } = await supabaseAdmin.from("form_insights").insert(insightRows)
      if (insertError) {
        console.error("Insight insert error:", insertError.message)
      }
    }

    return new Response(JSON.stringify(insights), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  } catch (err) {
    console.error("Edge function error:", err)
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }
})
