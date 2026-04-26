import "server-only";

import OpenAI from "openai";

import type { OrderForm } from "@/lib/supabase";

const DEFAULT_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

let _client: OpenAI | null = null;

function getClient(): OpenAI {
  if (_client) return _client;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY is not set. Add it to .env.local (see .env.example)."
    );
  }
  _client = new OpenAI({ apiKey });
  return _client;
}

const SYSTEM_PROMPT = `You write bedtime stories for Muslim children.
Tone: gentle, calming, wind-down (not exciting). End with the child character
falling asleep peacefully. Use the child's name naturally throughout. Weave in
1-2 age-appropriate references to Islamic practice (Bismillah, Alhamdulillah,
making dua, being thankful to Allah) — natural, not preachy. Let the lesson
emerge from the story, never state it explicitly. No theological claims, no
hadith citations, no scary elements, no unresolved conflict. Keep vocabulary
age-appropriate, universal (no ethnicity-specific content), and avoid rhyming
unless you can do it excellently. No Western magical tropes (for example:
wishing upon stars, magic spells, fairies, lucky charms). Any prayer, wish,
or hope (dua) must be directed only to Allah, never to nature or inanimate
objects. Output ONLY the story text — no preamble,
titles, or notes.`;

function targetWordsForLength(lengthMinutes: OrderForm["lengthMinutes"]): number {
  if (lengthMinutes === "test_5s") return 14;
  return Number(lengthMinutes) * 150;
}

function targetLengthLine(lengthMinutes: OrderForm["lengthMinutes"]): string {
  if (lengthMinutes === "test_5s") {
    return "Target length: ~5 seconds test clip when read aloud (~12-15 words).";
  }
  return `Target length: ${lengthMinutes} minutes when read aloud (~150 words/min).`;
}

function userPromptForStory(form: OrderForm): string {
  const targetWords = targetWordsForLength(form.lengthMinutes);
  const minWords = Math.max(12, Math.round(targetWords * 0.85));
  const maxWords = Math.round(targetWords * 1.15);
  return [
    `Child's name: ${form.childName}`,
    `Age: ${form.childAge}`,
    `What they love: ${form.interests}`,
    `Islamic value to reinforce: ${form.islamicValue}`,
    targetLengthLine(form.lengthMinutes),
    `Required length: ${minWords}-${maxWords} words. Do not go under ${minWords} words.`,
    form.note ? `Parent note: ${form.note}` : undefined,
  ]
    .filter(Boolean)
    .join("\n");
}

function countWords(text: string): number {
  return text
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

export async function generateStory(form: OrderForm): Promise<string> {
  const client = getClient();
  const targetWords = targetWordsForLength(form.lengthMinutes);
  const minWords = Math.max(12, Math.round(targetWords * 0.85));
  const maxTokens = Math.min(4096, Math.max(220, targetWords * 3));

  let bestText = "";
  let bestWordCount = 0;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const completion = await client.chat.completions.create({
      model: DEFAULT_MODEL,
      max_tokens: maxTokens,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content:
            attempt === 1
              ? userPromptForStory(form)
              : `${userPromptForStory(form)}\n\nYour previous draft was too short (${bestWordCount} words). Rewrite the full story from scratch and hit the required word range.`,
        },
      ],
    });

    const text = completion.choices[0]?.message?.content?.trim() ?? "";
    if (!text) continue;

    const words = countWords(text);
    if (words > bestWordCount) {
      bestText = text;
      bestWordCount = words;
    }
    if (words >= minWords) return text;
  }

  if (!bestText) throw new Error("OpenAI returned an empty story.");
  return bestText;
}

export type SafetyResult = {
  safe: boolean;
  reasons: string[];
};

const SAFETY_SYSTEM = `You are a cautious reviewer of a bedtime story that
will be sent to a Muslim family's child. Flag anything that a thoughtful
Muslim parent might object to: theological claims, contested fiqh,
inappropriate content for children, scary/violent imagery, culturally
insensitive content, or factual errors about Islam. Also flag any Western
magical tropes (for example: wishing upon stars, magic spells, fairies, lucky
charms), and flag any prayer/wish/hope (dua) directed to anything other than
Allah (such as stars, moon, trees, toys, or other objects). Be conservative —
when in doubt, flag.

Reply with STRICT JSON in this exact shape and nothing else (no markdown, no code fences):
{"safe": boolean, "reasons": string[]}

You must output a single valid JSON object only.`;

export async function safetyCheck(storyText: string): Promise<SafetyResult> {
  const client = getClient();
  const completion = await client.chat.completions.create({
    model: DEFAULT_MODEL,
    max_tokens: 500,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SAFETY_SYSTEM },
      {
        role: "user",
        content: `Review this bedtime story and respond with JSON only:\n\n${storyText}`,
      },
    ],
  });

  const raw = completion.choices[0]?.message?.content?.trim() ?? "";

  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return { safe: false, reasons: ["Safety check parse failure: " + raw.slice(0, 200)] };
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]) as { safe?: boolean; reasons?: string[] };
    return {
      safe: Boolean(parsed.safe),
      reasons: Array.isArray(parsed.reasons) ? parsed.reasons : [],
    };
  } catch (err) {
    return {
      safe: false,
      reasons: [
        `Safety check JSON parse error: ${
          err instanceof Error ? err.message : String(err)
        }`,
      ],
    };
  }
}
