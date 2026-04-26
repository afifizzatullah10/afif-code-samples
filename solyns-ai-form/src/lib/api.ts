import { supabase } from './supabase'
import { supabasePublic } from './supabasePublic'
import { edgeFunctionUserHeaders } from './edgeFunctionHeaders'
import type {
  AdminFormsResponse,
  AdminHealthResponse,
  AdminResponsesResponse,
  AdminUsersResponse,
  AdminWaitlistResponse,
  Form,
  FormBranding,
  FormWithResponseCount,
  DiscussionGuide,
  Response,
  FormInsight,
} from './types'

function ensureSupabaseEdgeEnv(): void {
  const url = String(import.meta.env.VITE_SUPABASE_URL ?? '').trim()
  const anon = String(import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim()
  if (!url || !anon) {
    throw new Error(
      'Missing or empty VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY in .env (no extra spaces). Paste from Supabase → Project Settings → API and restart npm run dev.'
    )
  }
}

/** Supabase gateway / Edge JSON may use `error`, `message`, or `msg` — not always `error`. */
function extractEdgeFunctionErrorMessage(parsed: unknown, rawText: string): string | null {
  if (parsed && typeof parsed === 'object') {
    const o = parsed as Record<string, unknown>
    for (const k of ['error', 'message', 'msg'] as const) {
      const v = o[k]
      if (typeof v === 'string' && v.trim().length > 0) return v.trim()
    }
  }
  const t = rawText.trim()
  if (t.length > 0 && t.length <= 512) return t.slice(0, 400)
  return null
}

/** Fallback when no parseable detail exists on the response body. */
const EDGE_401_HINT = [
  'Unauthorized (401). Try:',
  '• .env — VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY from the same project (Supabase → Project Settings → API); restart npm run dev.',
  '• Session — sign out and sign in again.',
  '• Deploy Edge Function: supabase functions deploy complete-response (applies verify_jwt from supabase/config.toml).',
].join('\n')

/** Shown when Supabase gateway returns ES256 — verifier at gateway rejects algorithm before Deno runs. */
const ES256_GATEWAY_HINT =
  'This project uses ES256 (asymmetric) session JWTs. The Edge Function gateway returns "Unsupported JWT algorithm ES256" unless JWT verification at the gateway is disabled for this function.\n\n' +
  'Fix: deploy so config applies — from the repo root:\n  supabase functions deploy complete-response\n\n' +
  '`supabase/config.toml` already has [functions.complete-response] verify_jwt = false; the deployed function must pick that up.'

async function getAccessToken(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession()
  if (session?.access_token) return session.access_token

  const { data, error } = await supabase.auth.refreshSession()
  if (error || !data.session?.access_token) {
    throw new Error('Not authenticated — please sign in again.')
  }
  return data.session.access_token
}

/** Call Edge Functions with fetch so apikey + Authorization are always sent (avoids SDK header merge issues). */
async function invokeEdgeJson<T>(name: string, body: unknown): Promise<T> {
  ensureSupabaseEdgeEnv()

  const base = String(import.meta.env.VITE_SUPABASE_URL ?? '').trim().replace(/\/$/, '')
  const url = `${base}/functions/v1/${encodeURIComponent(name)}`

  const post = async (accessToken: string) => {
    const res = await fetch(url, {
      method: 'POST',
      headers: edgeFunctionUserHeaders(accessToken) as Record<string, string>,
      body: JSON.stringify(body),
    })
    const text = await res.text()
    let parsed: unknown = null
    if (text) {
      try {
        parsed = JSON.parse(text) as unknown
      } catch {
        parsed = { error: text }
      }
    }
    return { res, parsed, rawText: text }
  }

  let token = await getAccessToken()
  let { res, parsed, rawText } = await post(token)

  if (res.status === 401) {
    const { data } = await supabase.auth.refreshSession()
    if (data.session?.access_token) {
      token = data.session.access_token
      ;({ res, parsed, rawText } = await post(token))
    }
  }

  if (!res.ok) {
    const apiError = extractEdgeFunctionErrorMessage(parsed, rawText)
    if (res.status === 401) {
      const es256 = apiError && /unsupported jwt algorithm|\bES256\b/i.test(apiError)
      const lines: string[] = []
      if (apiError) lines.push(`${apiError} (401)`)
      if (es256) lines.push(ES256_GATEWAY_HINT)
      else if (apiError && /jwt|signature|verification|malformed|expired/i.test(apiError)) {
        lines.push(
          'Tip: deploy `complete-response` with gateway verify_jwt disabled (see supabase/config.toml), then run: supabase functions deploy complete-response'
        )
      }
      lines.push(EDGE_401_HINT)
      throw new Error(lines.join('\n\n'))
    }
    throw new Error(apiError ?? `Request failed (${res.status})`)
  }

  if (parsed == null) {
    throw new Error(`Empty response from ${name}`)
  }
  return parsed as T
}

export async function fetchForms(): Promise<FormWithResponseCount[]> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data: forms, error } = await supabase
    .from('forms')
    .select('*, responses(count)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) throw error

  return (forms ?? []).map((f) => ({
    ...f,
    response_count: f.responses?.[0]?.count ?? 0,
  })) as FormWithResponseCount[]
}

export async function fetchForm(id: string): Promise<Form> {
  const { data, error } = await supabase
    .from('forms')
    .select('*')
    .eq('id', id)
    .single()

  if (error) throw error
  return data as Form
}

export async function fetchFormBySlug(slug: string): Promise<Form> {
  // Public link: use client without persisted user session so anon/RPC always works.
  const { data: rpcData, error: rpcError } = await supabasePublic.rpc('get_public_form_by_slug', {
    p_slug: slug,
  })

  if (!rpcError) {
    const row = Array.isArray(rpcData) ? rpcData[0] : rpcData
    if (row) return row as Form
  }

  // Backward-compatible fallback before DB rename migration is applied.
  const { data: legacyData, error: legacyErr } = await supabasePublic
    .from('studies')
    .select('*')
    .eq('share_slug', slug)
    .eq('status', 'active')
    .single()
  if (!legacyErr && legacyData) return legacyData as Form

  const { data, error } = await supabasePublic
    .from('forms')
    .select('*')
    .eq('share_slug', slug)
    .eq('status', 'active')
    .single()

  if (error) throw error
  return data as Form
}

// --- Study Creation ---

export interface GenerateGuideInput {
  objective: string
  language: 'en' | 'id'
  company_name?: string
  additional_context?: string
}

export async function generateDiscussionGuide(input: GenerateGuideInput): Promise<DiscussionGuide> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Not authenticated')

  return invokeEdgeJson<DiscussionGuide>('generate-guide', input)
}

const SHARE_SLUG_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789'

/** Short random public slug for `/s/:slug` (no title words — avoids length & guessability). */
function randomShareSlug(length = 8): string {
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  let out = ''
  for (let i = 0; i < length; i++) {
    out += SHARE_SLUG_ALPHABET[bytes[i]! % SHARE_SLUG_ALPHABET.length]!
  }
  return out
}

export interface CreateFormInput {
  title: string
  objective: string
  language: 'en' | 'id'
  discussion_guide: DiscussionGuide
  welcome_message: string
  thank_you_message: string
  branding?: FormBranding
}

export async function createForm(input: CreateFormInput): Promise<Form> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const share_slug = randomShareSlug()

  const { data, error } = await supabase
    .from('forms')
    .insert({
      user_id: user.id,
      title: input.title,
      objective: input.objective,
      language: input.language,
      discussion_guide: input.discussion_guide,
      welcome_message: input.welcome_message,
      thank_you_message: input.thank_you_message,
      branding: input.branding ?? {},
      share_slug,
      status: 'draft',
    })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      const retrySlug = randomShareSlug()
      const { data: retryData, error: retryError } = await supabase
        .from('forms')
        .insert({
          user_id: user.id,
          title: input.title,
          objective: input.objective,
          language: input.language,
          discussion_guide: input.discussion_guide,
          welcome_message: input.welcome_message,
          thank_you_message: input.thank_you_message,
          branding: input.branding ?? {},
          share_slug: retrySlug,
          status: 'draft',
        })
        .select()
        .single()

      if (retryError) throw retryError
      return retryData as Form
    }
    throw error
  }

  return data as Form
}

export async function updateFormStatus(id: string, status: Form['status']): Promise<Form> {
  const { data, error } = await supabase
    .from('forms')
    .update({ status })
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data as Form
}

export async function updateForm(id: string, updates: Partial<Form>): Promise<Form> {
  const { data, error } = await supabase
    .from('forms')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data as Form
}

// --- Responses ---

export async function fetchResponses(formId: string): Promise<Response[]> {
  const { data, error } = await supabase
    .from('responses')
    .select('*')
    .eq('form_id', formId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data ?? []) as Response[]
}

// --- Insights ---

export async function fetchInsights(formId: string): Promise<FormInsight[]> {
  const { data, error } = await supabase
    .from('form_insights')
    .select('*')
    .eq('form_id', formId)
    .order('generated_at', { ascending: false })

  if (error) throw error
  return (data ?? []) as FormInsight[]
}

export async function generateInsights(formId: string) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Not authenticated')

  return invokeEdgeJson('generate-insights', { form_id: formId })
}

/** Per-response transcript summary (Gemini). Call from Results when needed — not auto-run on submit. */
export async function generateResponseSummary(responseId: string): Promise<{ summary: string }> {
  return invokeEdgeJson<{ summary: string }>('complete-response', { response_id: responseId })
}

export async function deleteForm(id: string): Promise<void> {
  const { error } = await supabase
    .from('forms')
    .delete()
    .eq('id', id)

  if (error) throw error
}

// --- Backward-compatible aliases ---
export type CreateStudyInput = CreateFormInput
export const fetchStudies = fetchForms
export const fetchStudy = fetchForm
export const fetchStudyBySlug = fetchFormBySlug
export const createStudy = createForm
export const updateStudy = updateForm
export const updateStudyStatus = updateFormStatus
export const deleteStudy = deleteForm

async function invokeAdminDashboard<T>(payload: Record<string, unknown>): Promise<T> {
  return invokeEdgeJson<T>('admin-dashboard', payload)
}

export async function adminCheckAccess(): Promise<{ ok: true; is_admin: boolean; email: string }> {
  return invokeAdminDashboard<{ ok: true; is_admin: boolean; email: string }>({ action: 'check_access' })
}

export async function fetchAdminUsers(params?: {
  search?: string
  from?: string
  to?: string
}): Promise<AdminUsersResponse> {
  return invokeAdminDashboard<AdminUsersResponse>({
    action: 'users',
    ...(params ?? {}),
  })
}

export async function fetchAdminForms(params?: {
  search?: string
  status?: Form['status'] | ''
  language?: Form['language'] | ''
}): Promise<AdminFormsResponse> {
  return invokeAdminDashboard<AdminFormsResponse>({
    action: 'forms',
    ...(params ?? {}),
  })
}

export async function fetchAdminResponses(params?: {
  form_id?: string
  status?: Response['status'] | ''
  language?: Form['language'] | ''
}): Promise<AdminResponsesResponse> {
  return invokeAdminDashboard<AdminResponsesResponse>({
    action: 'responses',
    ...(params ?? {}),
  })
}

export async function fetchAdminWaitlist(params?: {
  search?: string
}): Promise<AdminWaitlistResponse> {
  return invokeAdminDashboard<AdminWaitlistResponse>({
    action: 'waitlist',
    ...(params ?? {}),
  })
}

export async function fetchAdminHealth(): Promise<AdminHealthResponse> {
  return invokeAdminDashboard<AdminHealthResponse>({ action: 'health' })
}

export async function adminUpdateFormStatus(formId: string, status: 'paused' | 'active') {
  return invokeAdminDashboard<{ form_id: string; status: string; updated_at: string }>({
    action: 'update_form_status',
    form_id: formId,
    status,
  })
}
