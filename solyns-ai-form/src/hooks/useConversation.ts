import { useState, useCallback, useRef } from 'react'
import { supabasePublic } from '@/lib/supabasePublic'
import { edgeFunctionAnonHeaders } from '@/lib/edgeFunctionHeaders'
import { errorMessageFromUnknown, getRespondentMetadata } from '@/lib/respondentMetadata'
import type { Study, TranscriptMessage } from '@/lib/types'
import { getWelcomeMessageBody } from '@/lib/welcomeMessage'

type ConversationStatus = 'welcome' | 'chatting' | 'typing' | 'complete' | 'error'

interface ConversationState {
  status: ConversationStatus
  transcript: TranscriptMessage[]
  responseId: string | null
  questionIndex: number
  followUpsUsed: number
  error: string | null
}

const RATE_LIMIT_MS = 2000

export function useConversation(study: Study | null) {
  const [state, setState] = useState<ConversationState>({
    status: 'welcome',
    transcript: [],
    responseId: null,
    questionIndex: 0,
    followUpsUsed: 0,
    error: null,
  })

  const lastRequestTime = useRef(0)
  const startedAtRef = useRef<number>(0)

  const totalQuestions = study?.discussion_guide?.questions?.length ?? 0

  const startConversation = useCallback(async () => {
    if (!study) return

    startedAtRef.current = Date.now()

    try {
      const metadata = getRespondentMetadata()
      const responseId = crypto.randomUUID()

      const { error } = await supabasePublic
        .from('responses')
        .insert({
          id: responseId,
          form_id: study.id,
          transcript: [],
          status: 'in_progress',
          respondent_metadata: metadata,
        })

      if (error) throw error

      // Build first AI message (the opening question)
      const firstQuestion = study.discussion_guide?.questions?.[0]
      const welcomeText = getWelcomeMessageBody(study)

      const firstAiMessage = firstQuestion
        ? `${welcomeText}\n\n${firstQuestion.text}`
        : welcomeText

      const now = new Date().toISOString()
      const initialTranscript: TranscriptMessage[] = [
        { role: 'ai', content: firstAiMessage, timestamp: now },
      ]

      // Save to DB
      await supabasePublic
        .from('responses')
        .update({ transcript: initialTranscript })
        .eq('id', responseId)

      setState({
        status: 'chatting',
        transcript: initialTranscript,
        responseId,
        questionIndex: 0,
        followUpsUsed: 0,
        error: null,
      })
    } catch (err) {
      setState(prev => ({
        ...prev,
        status: 'error',
        error: errorMessageFromUnknown(err, 'Failed to start conversation'),
      }))
    }
  }, [study])

  const sendMessage = useCallback(async (message: string) => {
    if (!study || !state.responseId || state.status !== 'chatting') return

    // Rate limiting
    const now = Date.now()
    if (now - lastRequestTime.current < RATE_LIMIT_MS) return
    lastRequestTime.current = now

    const timestamp = new Date().toISOString()
    const userMessage: TranscriptMessage = { role: 'user', content: message, timestamp }

    // Optimistically add user message and show typing
    setState(prev => ({
      ...prev,
      status: 'typing',
      transcript: [...prev.transcript, userMessage],
    }))

    const callConversation = async (retryCount = 0): Promise<void> => {
      try {
        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/conversation`,
          {
            method: 'POST',
            headers: edgeFunctionAnonHeaders(),
            body: JSON.stringify({
              form_id: study.id,
              response_id: state.responseId,
              message,
              transcript_so_far: [...state.transcript, userMessage],
              question_index: state.questionIndex,
              follow_ups_used: state.followUpsUsed,
            }),
          }
        )

        if (!response.ok) {
          const err = await response.json().catch(() => ({ error: 'Unknown error' }))
          throw new Error(err.error || `Request failed (${response.status})`)
        }

        const data = await response.json()

        const aiMessage: TranscriptMessage = {
          role: 'ai',
          content: data.message,
          timestamp: new Date().toISOString(),
          audio_base64: typeof data.audio_base64 === 'string' ? data.audio_base64 : undefined,
        }

        setState(prev => ({
          ...prev,
          status: data.is_complete ? 'complete' : 'chatting',
          transcript: [...prev.transcript, aiMessage],
          questionIndex: data.question_index,
          followUpsUsed: data.follow_ups_used,
          error: null,
        }))

        // On completion: save duration (per-response AI summary is optional — use Results tab).
        if (data.is_complete && state.responseId) {
          const durationSeconds = startedAtRef.current
            ? Math.round((Date.now() - startedAtRef.current) / 1000)
            : null

          if (durationSeconds) {
            supabasePublic
              .from('responses')
              .update({ duration_seconds: durationSeconds })
              .eq('id', state.responseId)
              .then(() => {})
          }
        }
      } catch (err) {
        if (retryCount === 0) {
          // Retry once after 2 seconds
          await new Promise(resolve => setTimeout(resolve, 2000))
          return callConversation(1)
        }

        setState(prev => ({
          ...prev,
          status: 'chatting',
          error: study.language === 'id'
            ? 'Terjadi kesalahan. Silakan coba lagi.'
            : 'Something went wrong. Please try again.',
        }))
      }
    }

    await callConversation()
  }, [study, state.responseId, state.status, state.transcript, state.questionIndex, state.followUpsUsed])

  const dismissError = useCallback(() => {
    setState(prev => ({ ...prev, error: null }))
  }, [])

  const retry = useCallback(() => {
    setState(prev => ({ ...prev, status: 'welcome', error: null }))
  }, [])

  return {
    status: state.status,
    transcript: state.transcript,
    questionIndex: state.questionIndex,
    totalQuestions,
    error: state.error,
    startConversation,
    sendMessage,
    dismissError,
    retry,
  }
}
