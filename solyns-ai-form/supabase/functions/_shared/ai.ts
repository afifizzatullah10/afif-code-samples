import { geminiGenerateJson, geminiGenerateText, resolveModelList } from "./gemini.ts"
import { openAIGenerateJson, openAIGenerateText, resolveOpenAIModelList } from "./openai.ts"

declare const Deno: { env: { get(key: string): string | undefined } }

type GenerateBody = Record<string, unknown>

export interface MultiProviderFailure {
  ok: false
  status: number
  userMessage: string
  logDetail: string
}

export async function generateJsonWithFallback(
  contents: unknown[],
  generationConfig: GenerateBody
): Promise<{ ok: true; data: unknown; rawText: string; provider: "openai" | "gemini"; model: string } | MultiProviderFailure> {
  const openAIApiKey = Deno.env.get("OPENAI_API_KEY")?.trim()
  const geminiApiKey = Deno.env.get("GEMINI_API_KEY")?.trim()

  if (openAIApiKey) {
    const openAIResult = await openAIGenerateJson(
      openAIApiKey,
      contents,
      generationConfig,
      resolveOpenAIModelList()
    )

    if (openAIResult.ok) {
      return {
        ok: true,
        data: openAIResult.data,
        rawText: openAIResult.rawText,
        provider: "openai",
        model: openAIResult.model,
      }
    }

    console.error("OpenAI JSON failed; falling back to Gemini:", openAIResult.logDetail)
  }

  if (geminiApiKey) {
    const geminiResult = await geminiGenerateJson(
      geminiApiKey,
      contents,
      generationConfig,
      resolveModelList()
    )

    if (geminiResult.ok) {
      return {
        ok: true,
        data: geminiResult.data,
        rawText: geminiResult.rawText,
        provider: "gemini",
        model: geminiResult.model,
      }
    }

    return {
      ok: false,
      status: 502,
      userMessage: geminiResult.userMessage,
      logDetail: geminiResult.logDetail,
    }
  }

  return {
    ok: false,
    status: 500,
    userMessage: "No AI provider configured. Set OPENAI_API_KEY and/or GEMINI_API_KEY in Supabase secrets.",
    logDetail: "OPENAI_API_KEY and GEMINI_API_KEY are both missing.",
  }
}

export async function generateTextWithFallback(
  contents: unknown[],
  generationConfig: GenerateBody
): Promise<{ ok: true; text: string; provider: "openai" | "gemini"; model: string } | MultiProviderFailure> {
  const openAIApiKey = Deno.env.get("OPENAI_API_KEY")?.trim()
  const geminiApiKey = Deno.env.get("GEMINI_API_KEY")?.trim()

  if (openAIApiKey) {
    const openAIResult = await openAIGenerateText(
      openAIApiKey,
      contents,
      generationConfig,
      resolveOpenAIModelList()
    )

    if (openAIResult.ok) {
      return {
        ok: true,
        text: openAIResult.text,
        provider: "openai",
        model: openAIResult.model,
      }
    }

    console.error("OpenAI text failed; falling back to Gemini:", openAIResult.logDetail)
  }

  if (geminiApiKey) {
    const geminiResult = await geminiGenerateText(
      geminiApiKey,
      contents,
      generationConfig,
      resolveModelList()
    )

    if (geminiResult.ok) {
      return {
        ok: true,
        text: geminiResult.text,
        provider: "gemini",
        model: geminiResult.model,
      }
    }

    return {
      ok: false,
      status: 502,
      userMessage: geminiResult.userMessage,
      logDetail: geminiResult.logDetail,
    }
  }

  return {
    ok: false,
    status: 500,
    userMessage: "No AI provider configured. Set OPENAI_API_KEY and/or GEMINI_API_KEY in Supabase secrets.",
    logDetail: "OPENAI_API_KEY and GEMINI_API_KEY are both missing.",
  }
}
