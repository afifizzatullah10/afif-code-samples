import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { generateTextWithFallback } from "../_shared/ai.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get("Authorization")
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } },
    )

    const { data: { user }, error: authError } = await supabaseUser.auth.getUser()
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    )

    const { response_id } = await req.json()

    if (!response_id || typeof response_id !== "string") {
      return new Response(JSON.stringify({ error: "Missing response_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const { data: row, error: rowError } = await supabaseUser
      .from("responses")
      .select("transcript, form_id")
      .eq("id", response_id)
      .maybeSingle()

    if (rowError || !row) {
      return new Response(JSON.stringify({ error: "Response not found or access denied" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const transcript = row.transcript
    if (!Array.isArray(transcript) || transcript.length === 0) {
      return new Response(JSON.stringify({ error: "No transcript to summarize" }), {
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

    // Resolve the form's language so the summary matches the respondent's tongue.
    let language = "en"
    if (row.form_id) {
      const { data: form } = await supabaseAdmin
        .from("forms")
        .select("language")
        .eq("id", row.form_id)
        .single()
      if (form?.language) language = String(form.language)
    }
    const languageName = language === "id" ? "Bahasa Indonesia" : "English"

    const lines: string[] = []
    for (const msg of transcript) {
      const speaker = msg.role === "ai" ? "Interviewer" : "Respondent"
      const tag = msg.source === "ai_follow_up" ? " [AI follow-up]" : ""
      lines.push(`${speaker}${tag}: ${msg.content}`)
    }
    const transcriptText = lines.join("\n")

    const prompt = `You are a research analyst. Summarize this form-response transcript into 2-3 key takeaways. Be specific — mention what the respondent actually said, not generic observations.

Write the summary in ${languageName}. Keep verbatim quotes in the original language the respondent used.

TRANSCRIPT:
${transcriptText}

Write a concise 2-4 sentence summary in ${languageName} focusing on:
- What this respondent cares about most
- Specific problems, praises, or suggestions they mentioned
- Any strong sentiments or notable direct quotes`

    const result = await generateTextWithFallback(
      [{ role: "user", parts: [{ text: prompt }] }],
      { temperature: 0.3, topP: 0.9 }
    )

    if (!result.ok) {
      console.error("complete-response AI failure:", result.logDetail)
      return new Response(JSON.stringify({ error: result.userMessage }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const summary = result.text

    // Only write ai_summary — don't overwrite status/completed_at (useFormFlow already set those)
    const { error: updateError } = await supabaseAdmin
      .from("responses")
      .update({ ai_summary: summary })
      .eq("id", response_id)

    if (updateError) {
      console.error("DB update error:", updateError)
      return new Response(JSON.stringify({ error: "Failed to save summary" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    return new Response(JSON.stringify({ summary }), {
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
