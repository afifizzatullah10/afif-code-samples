import { useState, useCallback, useRef, useEffect } from 'react'
import { edgeFunctionAnonHeaders } from '@/lib/edgeFunctionHeaders'
import { supabasePublic } from '@/lib/supabasePublic'
import { patchResponseKeepalive } from '@/lib/responseKeepalivePatch'
import { errorMessageFromUnknown, getRespondentMetadata } from '@/lib/respondentMetadata'
import type { Form, FormAnswer, FormStatus, DiscussionGuideQuestion } from '@/lib/types'

interface FormFlowState {
  status: FormStatus
  answers: FormAnswer[]
  responseId: string | null
  questionIndex: number
  followUpsUsed: number
  currentFollowUp: { question: string; description?: string } | null
  error: string | null
  navEpoch: number
}

const PREVIEW_RESPONSE_ID = 'preview'

interface PersistedFormFlowState {
  responseId: string
  questionIndex: number
  followUpsUsed: number
  currentFollowUp: { question: string; description?: string } | null
  answers: FormAnswer[]
  navEpoch: number
  startedAt: number
}

function formFlowStorageKey(formId: string) {
  return `solyns:form-flow:${formId}`
}

function readFormFlowDraft(formId: string): PersistedFormFlowState | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(formFlowStorageKey(formId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<PersistedFormFlowState>
    if (!parsed.responseId) return null
    return {
      responseId: parsed.responseId,
      questionIndex: Number.isFinite(parsed.questionIndex) ? Math.max(0, parsed.questionIndex ?? 0) : 0,
      followUpsUsed: Number.isFinite(parsed.followUpsUsed) ? Math.max(0, parsed.followUpsUsed ?? 0) : 0,
      currentFollowUp:
        parsed.currentFollowUp && typeof parsed.currentFollowUp.question === 'string'
          ? {
              question: parsed.currentFollowUp.question,
              description: parsed.currentFollowUp.description,
            }
          : null,
      answers: Array.isArray(parsed.answers) ? (parsed.answers as FormAnswer[]) : [],
      navEpoch: Number.isFinite(parsed.navEpoch) ? Math.max(0, parsed.navEpoch ?? 0) : 0,
      startedAt: Number.isFinite(parsed.startedAt) ? Math.max(0, parsed.startedAt ?? 0) : Date.now(),
    }
  } catch {
    return null
  }
}

function writeFormFlowDraft(formId: string, draft: PersistedFormFlowState) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(formFlowStorageKey(formId), JSON.stringify(draft))
  } catch {
    // Ignore storage quota / privacy mode failures.
  }
}

function clearFormFlowDraft(formId: string) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(formFlowStorageKey(formId))
  } catch {
    // Ignore storage failures.
  }
}

/** Convert structured answers back to transcript format for DB compatibility */
function answersToTranscript(answers: FormAnswer[]) {
  const transcript: {
    role: string
    content: string
    timestamp: string
    source?: 'question' | 'ai_follow_up'
    question_id?: string
  }[] = []
  for (const a of answers) {
    transcript.push({
      role: 'ai',
      content: a.questionText,
      timestamp: a.timestamp,
      source: 'question',
      question_id: a.questionId,
    })
    transcript.push({ role: 'user', content: a.answer, timestamp: a.timestamp })
    for (const fu of a.followUps) {
      transcript.push({ role: 'ai', content: fu.question, timestamp: a.timestamp, source: 'ai_follow_up' })
      transcript.push({ role: 'user', content: fu.answer, timestamp: a.timestamp })
    }
  }
  return transcript
}

async function persistTranscriptToServer(
  responseId: string,
  transcript: ReturnType<typeof answersToTranscript>
) {
  // eslint-disable-next-line no-console
  console.info(
    `[solyns] persist transcript → ${responseId.slice(0, 8)}… (${transcript.length} msgs)`,
    transcript.map(m => `${m.role}:${(m.content ?? '').slice(0, 40)}`)
  )
  // Direct UPDATE silently matches 0 rows for anon (Postgres UPDATE requires
  // SELECT visibility, which our RLS denies to anon). Use a SECURITY DEFINER
  // RPC that validates the row belongs to an active shared form.
  const { data, error } = await supabasePublic.rpc('update_public_response', {
    p_id: responseId,
    p_transcript: transcript,
  })
  if (error) {
    // eslint-disable-next-line no-console
    console.warn('[solyns] transcript RPC error — keepalive fallback', error)
    patchResponseKeepalive(responseId, { transcript })
    return
  }
  if (!data) {
    // eslint-disable-next-line no-console
    console.warn(
      `[solyns] transcript RPC returned NULL → row not found or form inactive (${responseId.slice(0, 8)}…)`
    )
    return
  }
  // eslint-disable-next-line no-console
  console.info(`[solyns] transcript saved ✓ → ${responseId.slice(0, 8)}…`)
}

export type UseFormFlowOptions = {
  /** Draft preview: no DB writes, free forward navigation between questions. */
  preview?: boolean
}

export function useFormFlow(form: Form | null, options?: UseFormFlowOptions) {
  const preview = options?.preview ?? false
  const [state, setState] = useState<FormFlowState>({
    status: 'welcome',
    answers: [],
    responseId: null,
    questionIndex: 0,
    followUpsUsed: 0,
    currentFollowUp: null,
    error: null,
    navEpoch: 0,
  })

  const startedAtRef = useRef<number>(0)
  const responseIdRef = useRef<string | null>(null)
  const answersRef = useRef<FormAnswer[]>([])
  const flowCompletedRef = useRef(false)
  const previewRef = useRef(preview)
  const formId = form?.id ?? null

  previewRef.current = preview
  responseIdRef.current = state.responseId
  answersRef.current = state.answers

  const questions = form?.discussion_guide?.questions ?? []
  const totalQuestions = questions.length

  useEffect(() => {
    if (preview || !formId || state.responseId) return
    const draft = readFormFlowDraft(formId)
    if (!draft) return

    flowCompletedRef.current = false
    startedAtRef.current = draft.startedAt || Date.now()

    setState(prev => {
      if (prev.responseId) return prev
      const nextQuestionIndex =
        totalQuestions > 0 ? Math.min(Math.max(draft.questionIndex, 0), totalQuestions - 1) : 0
      return {
        ...prev,
        status: 'answering',
        answers: draft.answers,
        responseId: draft.responseId,
        questionIndex: nextQuestionIndex,
        followUpsUsed: draft.followUpsUsed,
        currentFollowUp: draft.currentFollowUp,
        error: null,
        navEpoch: draft.navEpoch,
      }
    })
  }, [formId, preview, state.responseId, totalQuestions])

  const currentQuestion: DiscussionGuideQuestion | null =
    state.questionIndex < questions.length ? questions[state.questionIndex] : null

  const displayQuestion = state.currentFollowUp
    ? { text: state.currentFollowUp.question, description: state.currentFollowUp.description }
    : currentQuestion
      ? {
          text: currentQuestion.text,
          description: currentQuestion.description,
          imageUrl:
            currentQuestion.type === 'short_text' || currentQuestion.type === 'long_text'
              ? currentQuestion.image_url?.trim() || undefined
              : undefined,
        }
      : null

  const progress =
    totalQuestions > 0
      ? state.status === 'complete'
        ? 100
        : Math.min((state.questionIndex / totalQuestions) * 100, 100)
      : 0

  const startForm = useCallback(async () => {
    if (!form) return

    if (!preview) {
      const existingDraft = readFormFlowDraft(form.id)
      if (existingDraft) {
        flowCompletedRef.current = false
        startedAtRef.current = existingDraft.startedAt || Date.now()
        setState({
          status: 'answering',
          answers: existingDraft.answers,
          responseId: existingDraft.responseId,
          questionIndex: totalQuestions > 0 ? Math.min(Math.max(existingDraft.questionIndex, 0), totalQuestions - 1) : 0,
          followUpsUsed: existingDraft.followUpsUsed,
          currentFollowUp: existingDraft.currentFollowUp,
          error: null,
          navEpoch: existingDraft.navEpoch,
        })
        return
      }
    }

    startedAtRef.current = Date.now()

    if (preview) {
      flowCompletedRef.current = false
      setState({
        status: 'answering',
        answers: [],
        responseId: PREVIEW_RESPONSE_ID,
        questionIndex: 0,
        followUpsUsed: 0,
        currentFollowUp: null,
        error: null,
        navEpoch: 0,
      })
      return
    }

    try {
      flowCompletedRef.current = false
      const metadata = getRespondentMetadata()
      const id = crypto.randomUUID()

      const { error } = await supabasePublic
        .from('responses')
        .insert({
          id,
          form_id: form.id,
          transcript: [],
          status: 'in_progress',
          respondent_metadata: metadata,
        })

      if (error) throw error

      // eslint-disable-next-line no-console
      console.info(`[solyns] started response ${id.slice(0, 8)}… for form ${form.id.slice(0, 8)}…`)

      setState({
        status: 'answering',
        answers: [],
        responseId: id,
        questionIndex: 0,
        followUpsUsed: 0,
        currentFollowUp: null,
        error: null,
        navEpoch: 0,
      })
    } catch (err) {
      setState(prev => ({
        ...prev,
        status: 'error',
        error: errorMessageFromUnknown(err, 'Failed to start'),
      }))
    }
  }, [form, preview, totalQuestions])

  const completeForm = useCallback(async (finalAnswers: FormAnswer[]) => {
    setState(prev => ({ ...prev, status: 'complete', currentFollowUp: null }))
    answersRef.current = finalAnswers

    const rid = responseIdRef.current
    if (preview || !rid || rid === PREVIEW_RESPONSE_ID) return

    const transcript = answersToTranscript(finalAnswers)
    const durationSeconds =
      startedAtRef.current > 0
        ? Math.max(0, Math.round((Date.now() - startedAtRef.current) / 1000))
        : 0

    const completedAt = new Date().toISOString()
    const { data: completedId, error: completeErr } = await supabasePublic.rpc(
      'update_public_response',
      {
        p_id: rid,
        p_transcript: transcript,
        p_status: 'completed',
        p_completed_at: completedAt,
        p_duration_seconds: durationSeconds,
      }
    )
    if (!completeErr && completedId) {
      flowCompletedRef.current = true
      // eslint-disable-next-line no-console
      console.info(`[solyns] completed response ✓ → ${rid.slice(0, 8)}…`)
    } else {
      // eslint-disable-next-line no-console
      console.warn('[solyns] complete RPC failed — keepalive fallback', {
        completeErr,
        completedId,
      })
      patchResponseKeepalive(rid, {
        transcript,
        status: 'completed',
        completed_at: completedAt,
        duration_seconds: durationSeconds,
      })
    }

    if (formId) clearFormFlowDraft(formId)

    // Per-response AI summary is optional — generated from Results via "Generate AI summary" (saves tokens).
  }, [formId, preview])

  const advanceToNext = useCallback(
    (updatedAnswers: FormAnswer[]) => {
      const nextIndex = state.questionIndex + 1

      if (nextIndex >= totalQuestions) {
        // Form complete
        completeForm(updatedAnswers)
        return
      }

      setState(prev => ({
        ...prev,
        status: 'transitioning',
        currentFollowUp: null,
        followUpsUsed: 0,
      }))

      // Brief transition delay for animation
      setTimeout(() => {
        setState(prev => ({
          ...prev,
          status: 'answering',
          questionIndex: nextIndex,
        }))
      }, 300)
    },
    [state.questionIndex, totalQuestions, completeForm]
  )

  const submitAnswer = useCallback(
    async (answer: string) => {
      if (!form || !state.responseId || !currentQuestion) return

      const isFollowUp = !!state.currentFollowUp

      // Record answer locally (immutable; avoids stale merges for AI follow-up answers)
      let updatedAnswers: FormAnswer[]
      if (isFollowUp) {
        const lastIdx = state.answers.length - 1
        if (lastIdx < 0) return
        updatedAnswers = state.answers.map((a, idx) =>
          idx === lastIdx
            ? {
                ...a,
                followUps: [
                  ...a.followUps,
                  { question: state.currentFollowUp!.question, answer },
                ],
              }
            : a
        )
      } else {
        updatedAnswers = [...state.answers]
        updatedAnswers.push({
          questionId: currentQuestion.id,
          questionText: currentQuestion.text,
          answer,
          followUps: [],
          timestamp: new Date().toISOString(),
        })
      }

      answersRef.current = updatedAnswers

      if (preview) {
        setState(prev => ({ ...prev, answers: updatedAnswers }))
        advanceToNext(updatedAnswers)
        return
      }

      setState(prev => ({ ...prev, status: 'evaluating', answers: updatedAnswers }))

      // Build transcript from answers for DB storage
      const transcript = answersToTranscript(updatedAnswers)

      // Await so the row is persisted before navigation / tab close cancels the request
      await persistTranscriptToServer(state.responseId, transcript)

      // If AI follow-ups are disabled or this is a non-text question, skip AI evaluation
      const isTextQuestion = ['short_text', 'long_text'].includes(currentQuestion.type)
      const canFollowUp =
        currentQuestion.ai_follow_up_enabled &&
        isTextQuestion &&
        state.followUpsUsed < currentQuestion.max_follow_ups &&
        !isFollowUp // Don't evaluate follow-up answers for further follow-ups (keep it simple)

      if (!canFollowUp) {
        advanceToNext(updatedAnswers)
        return
      }

      try {
        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/conversation`,
          {
            method: 'POST',
            headers: edgeFunctionAnonHeaders(),
            body: JSON.stringify({
              form_id: form.id,
              response_id: state.responseId,
              answer,
              question_index: state.questionIndex,
              follow_ups_used: state.followUpsUsed,
              previous_answers: updatedAnswers.slice(0, -1),
            }),
          }
        )

        const data = await response.json().catch(() => ({ action: 'advance' }))

        if (data.action === 'follow_up' && data.follow_up_question) {
          setState(prev => ({
            ...prev,
            status: 'answering',
            currentFollowUp: {
              question: data.follow_up_question,
              description: undefined,
            },
            followUpsUsed: prev.followUpsUsed + 1,
          }))
        } else {
          advanceToNext(updatedAnswers)
        }
      } catch {
        advanceToNext(updatedAnswers)
      }
    },
    [
      form,
      preview,
      state.responseId,
      state.questionIndex,
      state.followUpsUsed,
      state.currentFollowUp,
      state.answers,
      currentQuestion,
      advanceToNext,
    ]
  )

  const canGoBack = state.status === 'answering' && !state.currentFollowUp && state.questionIndex > 0
  const canGoForward =
    state.status === 'answering' &&
    !state.currentFollowUp &&
    state.questionIndex < totalQuestions - 1 &&
    (preview || state.answers.length > state.questionIndex)

  const goBack = useCallback(() => {
    setState(prev => {
      if (prev.status !== 'answering' || prev.currentFollowUp) return prev
      if (prev.questionIndex <= 0) return prev
      return {
        ...prev,
        questionIndex: prev.questionIndex - 1,
        followUpsUsed: 0,
        currentFollowUp: null,
        navEpoch: prev.navEpoch + 1,
      }
    })
  }, [])

  const goForward = useCallback(() => {
    setState(prev => {
      if (prev.status !== 'answering' || prev.currentFollowUp) return prev
      if (prev.questionIndex >= totalQuestions - 1) return prev
      if (!preview && prev.answers.length <= prev.questionIndex) return prev
      return {
        ...prev,
        questionIndex: prev.questionIndex + 1,
        followUpsUsed: 0,
        currentFollowUp: null,
        navEpoch: prev.navEpoch + 1,
      }
    })
  }, [totalQuestions, preview])

  const prefillMainAnswer =
    !state.currentFollowUp && state.answers.length > state.questionIndex
      ? state.answers[state.questionIndex]?.answer ?? null
      : null

  useEffect(() => {
    const flushPartialToServer = () => {
      if (previewRef.current) return
      const rid = responseIdRef.current
      if (!rid || rid === PREVIEW_RESPONSE_ID) return
      if (flowCompletedRef.current) return
      const transcript = answersToTranscript(answersRef.current)
      if (transcript.length === 0) return
      patchResponseKeepalive(rid, { transcript })
    }

    let visTimer: ReturnType<typeof setTimeout> | null = null
    const onVisibility = () => {
      if (document.visibilityState !== 'hidden') {
        if (visTimer) {
          clearTimeout(visTimer)
          visTimer = null
        }
        return
      }
      visTimer = setTimeout(() => {
        visTimer = null
        if (document.visibilityState === 'hidden') flushPartialToServer()
      }, 400)
    }

    window.addEventListener('pagehide', flushPartialToServer)
    window.addEventListener('beforeunload', flushPartialToServer)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      if (visTimer) clearTimeout(visTimer)
      window.removeEventListener('pagehide', flushPartialToServer)
      window.removeEventListener('beforeunload', flushPartialToServer)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  /** Backup save: picks up silent Supabase failures and narrow unload races after the last answer. */
  useEffect(() => {
    if (preview) return
    const rid = state.responseId
    if (!rid || rid === PREVIEW_RESPONSE_ID) return
    if (state.status === 'complete') return
    const transcript = answersToTranscript(state.answers)
    if (transcript.length === 0) return

    const t = window.setTimeout(() => {
      void persistTranscriptToServer(rid, transcript)
    }, 700)
    return () => clearTimeout(t)
  }, [preview, state.responseId, state.answers, state.status])

  const retry = useCallback(() => {
    flowCompletedRef.current = false
    if (formId) clearFormFlowDraft(formId)
    setState({
      status: 'welcome',
      answers: [],
      responseId: null,
      questionIndex: 0,
      followUpsUsed: 0,
      currentFollowUp: null,
      error: null,
      navEpoch: 0,
    })
  }, [formId])

  useEffect(() => {
    if (preview || !formId) return
    if (state.status === 'welcome' || !state.responseId || state.responseId === PREVIEW_RESPONSE_ID) return

    if (state.status === 'complete') {
      clearFormFlowDraft(formId)
      return
    }

    writeFormFlowDraft(formId, {
      responseId: state.responseId,
      questionIndex: state.questionIndex,
      followUpsUsed: state.followUpsUsed,
      currentFollowUp: state.currentFollowUp,
      answers: state.answers,
      navEpoch: state.navEpoch,
      startedAt: startedAtRef.current || Date.now(),
    })
  }, [formId, preview, state.answers, state.currentFollowUp, state.navEpoch, state.questionIndex, state.responseId, state.status, state.followUpsUsed])

  return {
    status: state.status,
    answers: state.answers,
    questionIndex: state.questionIndex,
    totalQuestions,
    currentQuestion,
    displayQuestion,
    isFollowUp: !!state.currentFollowUp,
    progress,
    error: state.error,
    prefillMainAnswer,
    navigationEpoch: state.navEpoch,
    canGoBack,
    canGoForward,
    startForm,
    submitAnswer,
    goBack,
    goForward,
    retry,
  }
}
