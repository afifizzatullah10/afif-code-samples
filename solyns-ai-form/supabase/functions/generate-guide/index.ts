import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { generateJsonWithFallback } from "../_shared/ai.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

const VALID_TYPES = new Set([
  "short_text", "long_text", "multiple_choice", "dropdown", "rating",
  "nps", "opinion_scale", "yes_no", "number", "statement",
  "email", "url", "phone", "date", "legal",
])

function normaliseQuestion(raw: Record<string, unknown>, idx: number) {
  let type = String(raw.type ?? "short_text").toLowerCase().trim()
  const typeMap: Record<string, string> = {
    open: "short_text",
    open_ended: "long_text",
    text: "short_text",
    textarea: "long_text",
    scale: "opinion_scale",
    likert: "opinion_scale",
  }
  if (typeMap[type]) type = typeMap[type]
  if (!VALID_TYPES.has(type)) type = "short_text"

  let scale = null
  if (type === "rating" || type === "opinion_scale" || type === "nps" || type === "number") {
    const min = type === "nps" ? 0 : Number(raw.scale_min ?? raw.min ?? 1)
    const max = type === "nps" ? 10 : Number(raw.scale_max ?? raw.max ?? 5)
    scale = {
      min: Number.isFinite(min) ? min : 1,
      max: Number.isFinite(max) ? max : 5,
      ...(raw.min_label ? { min_label: String(raw.min_label) } : {}),
      ...(raw.max_label ? { max_label: String(raw.max_label) } : {}),
    }
  }

  let options: string[] | null = null
  if (Array.isArray(raw.options) && raw.options.length > 0) {
    options = raw.options.map(String)
  } else if (type === "yes_no") {
    options = ["Yes", "No"]
  } else if (type === "multiple_choice" || type === "dropdown") {
    options = ["Option 1", "Option 2", "Option 3"]
  }

  const maxFollowUps = Math.min(Math.max(Number(raw.max_follow_ups ?? 1), 0), 3)
  const followUpInstructions = raw.follow_up_instructions
    ? String(raw.follow_up_instructions)
    : null
  const canFollowUp =
    (type === "short_text" || type === "long_text") && maxFollowUps > 0

  return {
    id: String(raw.id ?? `q${idx + 1}`),
    text: String(raw.text ?? ""),
    description: raw.description ? String(raw.description) : undefined,
    type,
    required: raw.required !== false,
    options,
    allow_multiple: type === "multiple_choice" ? raw.allow_multiple === true : false,
    scale,
    ai_follow_up_enabled: canFollowUp,
    follow_up_instructions: followUpInstructions,
    max_follow_ups: maxFollowUps,
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
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

    const { objective, language = "en", company_name = "", additional_context = "" } = await req.json()

    if (!objective || objective.trim().length < 10) {
      return new Response(JSON.stringify({ error: "Objective must be at least 10 characters" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const hasOpenAI = !!Deno.env.get("OPENAI_API_KEY")?.trim()
    const hasGemini = !!Deno.env.get("GEMINI_API_KEY")?.trim()
    if (!hasOpenAI && !hasGemini) {
      return new Response(JSON.stringify({ error: "No AI provider configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const lang = language === "id" ? "Bahasa Indonesia" : "English"

    const systemPrompt = `You are an expert form designer and qualitative researcher. Your job is to craft a beautiful, high-conversion form that uncovers genuine user insights — similar to what a skilled Typeform or survey designer would create.

The user will describe what they want to learn. Design a discussion guide with 5-8 questions.

DESIGN PRINCIPLES:
- Start with an easy, warm-up question to build momentum (e.g. a simple choice or short text)
- Progress from general → specific → reflective
- Mix question types for engagement: use short_text for quick answers, long_text when you want depth, rating or opinion_scale for measurable sentiment, multiple_choice when categories help, nps for loyalty metrics, yes_no for binary filters
- Every question should earn its place — avoid redundant or filler questions
- Write in natural, conversational ${lang}${language === "id" ? " (casual, not stiff/formal)" : ""}
- Keep questions concise: respondents read on phones
- The whole form should take 3-6 minutes

TONE AND VOICE RULES (STRICT):
- Speak like a human text message: everyday casual language, use contractions when natural
- Be brief: max 2 short sentences for any interviewer-facing text
- No multi-part questions: every question must be exactly one clear question at a time
- Forbidden words/phrases: delve, explore, navigate, journey, testament, crucial, furthermore, additionally, "I understand"
- If language is Bahasa Indonesia, write in casual spoken Indonesian (bahasa sehari-hari), not formal baku
- If language is Bahasa Indonesia, write follow-up examples fully in Bahasa Indonesia only (no English words)
- For Bahasa Indonesia examples, use natural acknowledgments like "Oke," "Siap," "Paham," "Menarik,"

QUESTION TYPES (use exactly these strings):
- "short_text"      — one-line answer
- "long_text"       — paragraph answer
- "multiple_choice" — pick one or many from options (provide "options" array)
- "rating"          — star-style 1-5 (provide scale min/max)
- "opinion_scale"   — slider-style (provide scale min/max, optional min_label/max_label)
- "nps"             — Net Promoter Score 0-10 (fixed scale)
- "yes_no"          — boolean
- "number"          — numeric input

FOLLOW-UP RULES:
- For short_text and long_text questions, write follow_up_instructions that tell the AI interviewer WHEN to probe deeper (e.g. "If the answer is vague or less than 10 words, ask them to elaborate on the specific experience") and HOW (give an example probe)
- Set max_follow_ups to 1 for most questions, 2 only if the question is the core of the research
- For non-text types (rating, multiple_choice, etc.), set max_follow_ups to 0

Respond ONLY with valid JSON:
{
  "questions": [
    {
      "id": "q1",
      "text": "The question text",
      "description": "Optional helper text shown below the question",
      "type": "short_text",
      "required": true,
      "options": ["Option A", "Option B"],
      "scale_min": 1,
      "scale_max": 5,
      "min_label": "Not at all",
      "max_label": "Extremely",
      "follow_up_instructions": "When and how to probe deeper",
      "max_follow_ups": 1
    }
  ],
  "system_instructions": "Overall tone and personality instructions for the AI interviewer (1-2 sentences)",
  "estimated_duration_minutes": 5
}

Notes:
- "options" only needed for multiple_choice
- "scale_min/max" only needed for rating, opinion_scale, number
- "min_label/max_label" optional, only for opinion_scale
- For yes_no and nps, no extra fields needed`

    const userPrompt = `Research objective: ${objective}
Language: ${lang}
Company/Brand: ${company_name || "Not specified"}
Additional context: ${additional_context || "None"}`

    const fullPrompt = `${systemPrompt}\n\n${userPrompt}`

    const result = await generateJsonWithFallback(
      [{ role: "user", parts: [{ text: fullPrompt }] }],
      { temperature: 0.7, topP: 0.95 }
    )

    if (!result.ok) {
      console.error("generate-guide AI failure:", result.logDetail)
      return new Response(JSON.stringify({ error: result.userMessage }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const parsed = result.data as Record<string, unknown>

    const rawQuestions = parsed.questions
    if (!Array.isArray(rawQuestions) || rawQuestions.length === 0) {
      return new Response(
        JSON.stringify({ error: "AI generated no questions. Please try again." }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    const questions = rawQuestions.map((q, i) => normaliseQuestion(q as Record<string, unknown>, i))

    const discussionGuide = {
      questions,
      system_instructions: String(
        parsed.system_instructions ||
          "Be warm, empathetic, and concise. Acknowledge responses before asking the next question."
      ),
      estimated_duration_minutes: Math.max(
        1,
        Math.min(Number(parsed.estimated_duration_minutes) || 5, 30)
      ),
      created_with_ai: true,
    }

    return new Response(JSON.stringify(discussionGuide), {
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
