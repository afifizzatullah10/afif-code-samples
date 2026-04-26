import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { generateJsonWithFallback, generateTextWithFallback } from "../_shared/ai.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

function normalizeLanguage(input: unknown): "id" | "en" {
  const raw = String(input ?? "en").trim().toLowerCase()
  if (raw === "id" || raw === "indonesian" || raw === "bahasa" || raw === "bahasa indonesia") {
    return "id"
  }
  return "en"
}

function looksIndonesian(text: string): boolean {
  const t = text.toLowerCase()
  return /\b(dan|yang|untuk|dengan|atau|karena|tidak|sudah|belum|bisa|apakah|bagaimana|kenapa|mengapa|boleh|tolong|terima kasih|dari|juga|saja|sangat|mau|gak|nggak|aku|kamu|dia|kita|mereka|ini|itu)\b/.test(t)
}

/** Heuristic: only normalize when the line looks like the wrong language for the form. */
function needsLanguageNormalization(formLanguage: "en" | "id", text: string): boolean {
  if (formLanguage === "en") {
    return looksIndonesian(text)
  }
  if (looksIndonesian(text)) {
    return false
  }
  // Indonesian form but no Indonesian markers — often English; normalize if it looks like English phrasing
  return /\b(what|how|why|can you|could you|would you|the|this|that|your|is it|are you|did|have you|got it|makes sense|interesting)\b/i.test(
    text
  )
}

function ensureFollowUpAcknowledgment(formLanguage: "en" | "id", input: string): string {
  const text = input.trim()
  if (!text) return text

  const englishAcknowledgments = ["Got it,", "Makes sense,", "Interesting,"]
  const indonesianAcknowledgments = ["Oke,", "Siap,", "Paham,", "Menarik,"]
  const acknowledgmentList = formLanguage === "id" ? indonesianAcknowledgments : englishAcknowledgments

  const startsWithAcknowledgment = acknowledgmentList.some((ack) => {
    const normalizedAck = ack.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    const pattern = new RegExp(`^\\s*${normalizedAck}\\s*`, "i")
    return pattern.test(text)
  })
  if (startsWithAcknowledgment) return text

  // Keep deterministic style per response text to avoid noisy random UX.
  const pickIndex = Math.abs(
    Array.from(text).reduce((acc, ch) => acc + ch.charCodeAt(0), 0)
  ) % acknowledgmentList.length
  return `${acknowledgmentList[pickIndex]} ${text}`
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    )

    const body = await req.json()

    // ── Accept BOTH the new one-question flow AND the legacy chat flow ──
    // New flow (useFormFlow):  { form_id, answer, question_index, ... }
    // Legacy flow (useConversation): { form_id|study_id, message, transcript_so_far, ... }
    const form_id = body.form_id || body.study_id
    const answer = body.answer ?? body.message
    const response_id = body.response_id
    const question_index = body.question_index ?? 0
    const follow_ups_used = body.follow_ups_used ?? 0
    const transcript_so_far = body.transcript_so_far ?? []
    const previous_answers = body.previous_answers

    if (!form_id || !answer) {
      return new Response(JSON.stringify({ error: "Missing required fields (form_id and answer/message)" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const { data: form, error: formError } = await supabase
      .from("forms")
      .select("*")
      .eq("id", form_id)
      .single()

    if (formError || !form) {
      return new Response(JSON.stringify({ error: "Form not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const guide = form.discussion_guide
    if (!guide || !guide.questions || guide.questions.length === 0) {
      return new Response(JSON.stringify({ error: "Form has no discussion guide" }), {
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

    const currentQuestion = guide.questions[question_index]
    if (!currentQuestion) {
      return new Response(
        JSON.stringify({ action: "advance", follow_up_question: null }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    const maxFollowUps = currentQuestion.max_follow_ups ?? 1
    const companyName = form.branding?.company_name || "the company"
    const formLanguage = normalizeLanguage(form.language)
    const languageRules = formLanguage === "id"
      ? `- Language: STRICTLY Bahasa Indonesia (casual, natural Bahasa sehari-hari — not formal baku).
- Do NOT use any English words or phrases. If the respondent mixes Indonesian and English, you must still reply 100% in Bahasa Indonesia.
- Use natural Indonesian acknowledgments (e.g., "Oke,", "Siap,", "Paham,", "Menarik,").
- Do NOT use English-style acknowledgments (e.g., "Got it,", "Makes sense,", "Interesting,") — those are for English-only forms.`
      : `- Language: STRICTLY English.
- Do NOT use any Indonesian words or phrases. If the respondent mixes English and Indonesian, you must still reply 100% in English.
- Use natural English acknowledgments (e.g., "Got it,", "Makes sense,", "Interesting,").
- Do NOT use Indonesian-style acknowledgments (e.g., "Oke,", "Siap,", "Paham,", "Menarik,") — those are for Indonesian-only forms.`

    // Build context from previous answers (new flow) or transcript (legacy)
    let contextBlock = ""
    if (Array.isArray(previous_answers) && previous_answers.length > 0) {
      contextBlock = previous_answers
        .map((a: { questionText: string; answer: string; followUps?: { question: string; answer: string }[] }) => {
          const parts = [`Q: ${a.questionText}`, `A: ${a.answer}`]
          if (a.followUps) {
            for (const fu of a.followUps) {
              parts.push(`  Follow-up Q: ${fu.question}`)
              parts.push(`  Follow-up A: ${fu.answer}`)
            }
          }
          return parts.join("\n")
        })
        .join("\n\n")
    } else if (transcript_so_far.length > 0) {
      contextBlock = transcript_so_far
        .map((msg: { role: string; content: string }) =>
          `${msg.role === "ai" ? "Interviewer" : "Respondent"}: ${msg.content}`
        )
        .join("\n")
    }

    const systemPrompt = `You are a skilled AI research interviewer for ${companyName}. A respondent just answered a question. Your ONLY job: decide whether to ask ONE follow-up question to get deeper insight, or let the form advance to the next question.

RULES:
${languageRules}
- If action is "follow_up", you MUST start with one very short acknowledgment, then ask the question.
  Example phrases (use ONLY the form language from above — never mix):
  - English: "Got it,", "Makes sense,", "Interesting,"
  - Bahasa Indonesia: "Oke,", "Siap,", "Paham,", "Menarik,"
- Speak like a human text message: casual, everyday wording.
- Be brief: max 2 short sentences.
- Ask exactly one clear, simple question at a time (no multi-part questions).
- Forbidden words/phrases: delve, explore, navigate, journey, testament, crucial, furthermore, additionally, "I understand".
- You may ask a follow-up ONLY if ALL of these are true:
  1. The answer is vague, very short, or surface-level.
  2. You have not exceeded the follow-up limit (${follow_ups_used} of ${maxFollowUps} used).
  3. A follow-up would genuinely reveal something the main answer didn't.
- If the answer is already detailed, specific, or thoughtful → DO NOT follow up.
- Never repeat or rephrase the original question.
- Never be pushy or make the respondent uncomfortable.
- Keep follow-up questions short (1 sentence preferred, max 2).
- Reference what they actually said to show you're listening.
- Final output language check before responding:
  - If Language is English, your follow-up_question MUST be fully English.
  - If Language is Bahasa Indonesia, your follow-up_question MUST be fully Bahasa Indonesia.
  - If not, rewrite it into the required language before returning JSON.

QUESTION BEING ANSWERED:
"${currentQuestion.text}"

FOLLOW-UP GUIDELINES FROM THE RESEARCHER:
${currentQuestion.follow_up_instructions || "Use your judgment — probe if the answer lacks specificity."}

${contextBlock ? `PREVIOUS CONVERSATION:\n${contextBlock}\n` : ""}
RESPONDENT'S ANSWER:
"${answer}"

Respond with JSON:
{
  "action": "follow_up" or "advance",
  "follow_up_question": "your follow-up question (only if action is follow_up, otherwise null)",
  "reasoning": "1-sentence internal note explaining your decision"
}`

    const result = await generateJsonWithFallback(
      [{ role: "user", parts: [{ text: systemPrompt }] }],
      { temperature: 0.4, topP: 0.9 }
    )

    if (!result.ok) {
      console.error("conversation AI failure:", result.logDetail)
      return new Response(
        JSON.stringify({ action: "advance", follow_up_question: null }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    const aiResult = result.data as Record<string, unknown>
    console.log(`[conversation] AI decided (${result.provider}/${result.model}):`, JSON.stringify(aiResult))

    const action = aiResult.action === "follow_up" ? "follow_up" : "advance"
    let follow_up_question = action === "follow_up" && aiResult.follow_up_question
      ? String(aiResult.follow_up_question)
      : null

    if (action === "follow_up" && follow_up_question && needsLanguageNormalization(formLanguage, follow_up_question)) {
      const targetLanguageLabel = formLanguage === "id" ? "Bahasa Indonesia" : "English"
      const ackHint =
        formLanguage === "id"
          ? 'Optional: start with a very short natural acknowledgment in Bahasa (e.g. "Oke," "Paham,") before the question.'
          : 'Optional: start with a very short natural English acknowledgment (e.g. "Got it," "Makes sense," "Interesting,") before the question — keep the same tone as the system rules.'
      const rewriteResult = await generateTextWithFallback(
        [{
          role: "user",
          parts: [{
            text: `Fix the language of this follow-up so it is fully natural ${targetLanguageLabel} only. Do not change the meaning; only correct wrong language or phrasing.
${ackHint}
Max 2 short sentences total (acknowledgment + one question, or just the question).
Return plain text only, no JSON, no surrounding quotes.

Line to fix:
"${follow_up_question}"`,
          }],
        }],
        { temperature: 0.2, topP: 0.9 }
      )

      if (rewriteResult.ok) {
        const rewritten = rewriteResult.text.trim().replace(/^["']|["']$/g, "")
        if (rewritten) {
          follow_up_question = rewritten
        }
        console.log(
          `[conversation] follow-up language fix (${formLanguage}) (${rewriteResult.provider}/${rewriteResult.model})`
        )
      } else {
        console.error(`[conversation] follow-up language fix failed for ${formLanguage}:`, rewriteResult.logDetail)
      }
    } else if (action === "follow_up" && follow_up_question) {
      console.log(`[conversation] follow-up left as-is (language already matches ${formLanguage})`)
    }

    if (action === "follow_up" && follow_up_question) {
      follow_up_question = ensureFollowUpAcknowledgment(formLanguage, follow_up_question)
    }

    // ── Legacy chat-flow compatibility: also return message/is_follow_up/etc. ──
    const isLegacy = !!body.message && !body.answer

    if (isLegacy && response_id) {
      const now = new Date().toISOString()
      const responseMessage = follow_up_question || guide.questions[question_index + 1]?.text || "Thank you for your answers!"
      const updatedTranscript = [
        ...transcript_so_far,
        { role: "user", content: answer, timestamp: now },
        { role: "ai", content: responseMessage, timestamp: now },
      ]

      let newQuestionIndex = question_index
      let newFollowUpsUsed = follow_ups_used
      let isComplete = false

      if (action === "follow_up") {
        newFollowUpsUsed = follow_ups_used + 1
      } else {
        newQuestionIndex = question_index + 1
        newFollowUpsUsed = 0
        if (newQuestionIndex >= guide.questions.length) {
          isComplete = true
        }
      }

      const updateData: Record<string, unknown> = { transcript: updatedTranscript }
      if (isComplete) {
        updateData.status = "completed"
        updateData.completed_at = now
      }
      await supabase.from("responses").update(updateData).eq("id", response_id)

      return new Response(JSON.stringify({
        message: responseMessage,
        question_index: newQuestionIndex,
        follow_ups_used: newFollowUpsUsed,
        is_follow_up: action === "follow_up",
        is_complete: isComplete,
        action,
        follow_up_question,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    // ── New one-question flow response ──
    return new Response(JSON.stringify({
      action,
      follow_up_question,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  } catch (err) {
    console.error("Edge function error:", err)
    // Graceful: don't block the respondent
    return new Response(
      JSON.stringify({ action: "advance", follow_up_question: null }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  }
})
