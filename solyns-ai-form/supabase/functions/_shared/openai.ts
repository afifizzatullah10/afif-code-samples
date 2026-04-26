/**
 * Shared OpenAI REST helpers for Edge Functions.
 * Uses Chat Completions API with model fallback support.
 */

declare const Deno: { env: { get(key: string): string | undefined } }

export const OPENAI_MODELS_DEFAULT = [
  "gpt-4o-mini",
  "gpt-4.1-mini",
  "gpt-4o",
] as const

/** Optional override: `supabase secrets set OPENAI_MODEL=gpt-4o-mini` */
export function resolveOpenAIModelList(): readonly string[] {
  const envModel = Deno.env.get("OPENAI_MODEL")?.trim()
  if (!envModel) return OPENAI_MODELS_DEFAULT
  const rest = OPENAI_MODELS_DEFAULT.filter((m) => m !== envModel)
  return [envModel, ...rest]
}

type GenerateBody = Record<string, unknown>

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504])

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

function parseOpenAIError(body: string): string | null {
  try {
    const j = JSON.parse(body) as { error?: { message?: string; code?: string; type?: string } }
    const msg = j.error?.message
    if (!msg) return null
    const line = msg.split("\n")[0].slice(0, 280)
    const code = j.error?.code || j.error?.type
    return code ? `${code}: ${line}` : line
  } catch {
    return body.slice(0, 200) || null
  }
}

function mapConfigForOpenAI(generationConfig: GenerateBody): Record<string, unknown> {
  const mapped: Record<string, unknown> = {}

  if (typeof generationConfig.temperature === "number") {
    mapped.temperature = generationConfig.temperature
  }
  if (typeof generationConfig.topP === "number") {
    mapped.top_p = generationConfig.topP
  } else if (typeof generationConfig.top_p === "number") {
    mapped.top_p = generationConfig.top_p
  }
  if (typeof generationConfig.max_tokens === "number") {
    mapped.max_tokens = generationConfig.max_tokens
  } else if (typeof generationConfig.maxOutputTokens === "number") {
    mapped.max_tokens = generationConfig.maxOutputTokens
  }

  return mapped
}

function firstPromptText(contents: unknown[]): string {
  for (const item of contents) {
    const row = item as { parts?: Array<{ text?: string }> } | undefined
    const text = row?.parts?.[0]?.text
    if (typeof text === "string" && text.trim().length > 0) {
      return text
    }
  }
  return ""
}

async function postChatCompletionWithRetries(
  apiKey: string,
  body: Record<string, unknown>,
  label: string,
  maxAttempts = 4
): Promise<{ ok: true; raw: string } | { ok: false; status: number; raw: string }> {
  let lastStatus = 502
  let lastRaw = ""

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    })

    const raw = await res.text()
    lastStatus = res.status
    lastRaw = raw

    if (res.ok) {
      return { ok: true, raw }
    }

    const retryable = RETRYABLE_STATUS.has(res.status)
    if (!retryable || attempt === maxAttempts - 1) {
      console.error(`${label} failed (final): status=${res.status}`, raw.slice(0, 500))
      return { ok: false, status: res.status, raw }
    }

    const delayMs = 500 * Math.pow(2, attempt)
    console.warn(
      `${label} got ${res.status} (attempt ${attempt + 1}/${maxAttempts}), retrying in ${delayMs}ms...`
    )
    await sleep(delayMs)
  }

  return { ok: false, status: lastStatus, raw: lastRaw }
}

export interface OpenAIJsonResult {
  ok: true
  data: unknown
  rawText: string
  model: string
}

export interface OpenAIFailure {
  ok: false
  status: number
  userMessage: string
  logDetail: string
}

export async function openAIGenerateJson(
  apiKey: string,
  contents: unknown[],
  generationConfig: GenerateBody,
  models: readonly string[] = OPENAI_MODELS_DEFAULT
): Promise<OpenAIJsonResult | OpenAIFailure> {
  const prompt = firstPromptText(contents)
  let lastStatus = 502
  let lastLog = ""

  for (const model of models) {
    const body: Record<string, unknown> = {
      model,
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      ...mapConfigForOpenAI(generationConfig),
    }

    const attempt = await postChatCompletionWithRetries(apiKey, body, `OpenAI JSON ${model}`)

    if (!attempt.ok) {
      lastStatus = attempt.status
      lastLog = `model=${model} status=${attempt.status} body=${attempt.raw.slice(0, 800)}`
      continue
    }

    const raw = attempt.raw
    let data: unknown
    try {
      data = JSON.parse(raw)
    } catch {
      lastLog = `model=${model} invalid JSON from OpenAI`
      continue
    }

    const d = data as { choices?: Array<{ message?: { content?: string | null } }> }
    const text = d.choices?.[0]?.message?.content?.trim()
    if (!text) {
      lastLog = `model=${model} empty content`
      continue
    }

    try {
      const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim()
      const parsed = JSON.parse(cleaned)
      return { ok: true, data: parsed, rawText: text, model }
    } catch {
      lastLog = `model=${model} response not JSON: ${text.slice(0, 200)}`
      continue
    }
  }

  const userMessage =
    lastStatus === 429 || lastStatus === 503
      ? "OpenAI is temporarily busy. Please try again."
      : lastStatus === 401 || lastStatus === 403
        ? "OpenAI request was rejected. Check OPENAI_API_KEY in Supabase secrets."
        : "AI generation failed. Please try again."

  const parsedErr = parseOpenAIError(lastLog.split("body=")[1] || lastLog)
  const logDetail = parsedErr ? `${lastLog} | parsed: ${parsedErr}` : lastLog

  return { ok: false, status: 502, userMessage, logDetail }
}

export async function openAIGenerateText(
  apiKey: string,
  contents: unknown[],
  generationConfig: GenerateBody,
  models: readonly string[] = OPENAI_MODELS_DEFAULT
): Promise<{ ok: true; text: string; model: string } | OpenAIFailure> {
  const prompt = firstPromptText(contents)
  let lastStatus = 502
  let lastLog = ""

  for (const model of models) {
    const body: Record<string, unknown> = {
      model,
      messages: [{ role: "user", content: prompt }],
      ...mapConfigForOpenAI(generationConfig),
    }

    const attempt = await postChatCompletionWithRetries(apiKey, body, `OpenAI text ${model}`)

    if (!attempt.ok) {
      lastStatus = attempt.status
      lastLog = `model=${model} status=${attempt.status} body=${attempt.raw.slice(0, 800)}`
      continue
    }

    const raw = attempt.raw
    let data: unknown
    try {
      data = JSON.parse(raw)
    } catch {
      lastLog = `model=${model} invalid JSON from OpenAI`
      continue
    }

    const d = data as { choices?: Array<{ message?: { content?: string | null } }> }
    const text = d.choices?.[0]?.message?.content?.trim()
    if (text) {
      return { ok: true, text, model }
    }

    lastLog = `model=${model} empty content`
  }

  const userMessage =
    lastStatus === 429 || lastStatus === 503
      ? "OpenAI is temporarily busy. Please try again."
      : "AI summary generation failed. Please try again."

  return { ok: false, status: 502, userMessage, logDetail: lastLog }
}
