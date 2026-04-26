import { useState, useRef, useEffect, useLayoutEffect, useCallback, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { VoiceRecorder } from '@/components/chat/VoiceRecorder'
import { useVoiceInput } from '@/hooks/useVoiceInput'
import { useFollowUpWordReveal } from '@/hooks/useFollowUpWordReveal'
import { edgeFunctionAnonHeaders } from '@/lib/edgeFunctionHeaders'
import { cn } from '@/lib/utils'
import type { DiscussionGuideQuestion } from '@/lib/types'
import { Check, Keyboard, Loader2, Mic, Sparkles, Square, Volume2 } from 'lucide-react'

const CONTACT_INPUT_TYPES = ['email', 'url', 'phone', 'date'] as const
const READ_ALOUD_STORAGE_KEY = 'solyns:read-aloud-enabled'

function isContactInputType(t: string): t is (typeof CONTACT_INPUT_TYPES)[number] {
  return (CONTACT_INPUT_TYPES as readonly string[]).includes(t)
}

function startsWithIgnoreCase(value: string, prefix: string): boolean {
  return value.toLowerCase().startsWith(prefix.toLowerCase())
}

function parseOtherAnswer(raw: string, otherLabel: string): { selectedOther: boolean; otherText: string } {
  const trimmed = raw.trim()
  const prefix = `${otherLabel}:`
  if (startsWithIgnoreCase(trimmed, prefix)) {
    return { selectedOther: true, otherText: trimmed.slice(prefix.length).trim() }
  }
  if (trimmed.toLowerCase() === otherLabel.toLowerCase()) {
    return { selectedOther: true, otherText: '' }
  }
  return { selectedOther: false, otherText: '' }
}

interface QuestionCardProps {
  question: DiscussionGuideQuestion
  displayText: string
  displayDescription?: string
  /** Shown above the question for the main prompt only (not AI follow-ups). */
  imageUrl?: string | null
  questionNumber: number
  isFollowUp: boolean
  language: 'en' | 'id'
  readAloudDefaultEnabled?: boolean
  readAloudStorageScope?: string
  readAloudDisabled?: boolean
  onSubmit: (answer: string) => void
  isEvaluating: boolean
  prefillMainAnswer?: string | null
  navigationEpoch?: number
}

type AudioPromptPhase = 'idle' | 'preparing' | 'playing' | 'fallback' | 'done'

export function QuestionCard({
  question,
  displayText,
  displayDescription,
  imageUrl,
  questionNumber,
  isFollowUp,
  language,
  readAloudDefaultEnabled = true,
  readAloudStorageScope,
  readAloudDisabled = false,
  onSubmit,
  isEvaluating,
  prefillMainAnswer = null,
  navigationEpoch = 0,
}: QuestionCardProps) {
  const [answer, setAnswer] = useState('')
  const [selectedOptions, setSelectedOptions] = useState<string[]>([])
  const [otherOptionText, setOtherOptionText] = useState('')
  const [ratingValue, setRatingValue] = useState<number | null>(null)
  const [legalChecked, setLegalChecked] = useState(false)
  /** User chose optional keyboard; otherwise voice-first when supported. */
  const [textInputChosen, setTextInputChosen] = useState(false)
  /** Prevent replaying question TTS after user has started speaking on this prompt. */
  const [suppressedPromptKey, setSuppressedPromptKey] = useState<string | null>(null)
  const [audioPromptPhase, setAudioPromptPhase] = useState<AudioPromptPhase>('idle')
  const [audioSyncedVisibleChars, setAudioSyncedVisibleChars] = useState(0)
  const storageKey = `${READ_ALOUD_STORAGE_KEY}:${readAloudStorageScope ?? 'global'}`
  const [readAloudEnabled, setReadAloudEnabled] = useState<boolean>(readAloudDefaultEnabled)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const lineInputRef = useRef<HTMLInputElement | HTMLSelectElement>(null)
  const readAloudAudioRef = useRef<HTMLAudioElement | null>(null)
  const readAloudObjectUrlRef = useRef<string | null>(null)
  const audioRevealFrameRef = useRef<number | null>(null)

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || ''

  const handleVoiceTranscript = useCallback((text: string) => {
    setAnswer(prev => (prev ? prev + ' ' + text : text))
  }, [])

  const voice = useVoiceInput({
    language,
    supabaseUrl,
    onTranscript: handleVoiceTranscript,
  })

  const promptAudioKey = useMemo(
    () =>
      `${navigationEpoch}\0${displayText}\0${displayDescription ?? ''}\0${isFollowUp ? '1' : '0'}\0${question.type}`,
    [navigationEpoch, displayText, displayDescription, isFollowUp, question.type]
  )

  const handleStartRecording = useCallback(() => {
    setSuppressedPromptKey(promptAudioKey)
    voice.startRecording()
  }, [promptAudioKey, voice])

  const followUpRevealKey = useMemo(
    () =>
      `${navigationEpoch}\0${displayText}\0${displayDescription ?? ''}\0${isFollowUp ? '1' : '0'}`,
    [navigationEpoch, displayText, displayDescription, isFollowUp]
  )
  const mainQuestionRevealKey = useMemo(
    () => `${navigationEpoch}\0${displayText}\0${displayDescription ?? ''}\0${question.type}`,
    [navigationEpoch, displayText, displayDescription, question.type]
  )
  const revealTiming = useMemo(
    () => (isFollowUp ? undefined : { totalDurationMs: 2100, firstDelayMs: 0 }),
    [isFollowUp]
  )
  const isTextareaQuestion = question.type === 'short_text' || question.type === 'long_text'
  const isReadAloudSupported = typeof window !== 'undefined' && !!supabaseUrl
  const isReadAloudActive = !readAloudDisabled && readAloudEnabled
  const readAloudEligible = isFollowUp || isTextareaQuestion
  const isPromptReadAloudSuppressed = suppressedPromptKey === promptAudioKey
  const shouldPreparePromptForAudio =
    isReadAloudSupported &&
    isReadAloudActive &&
    readAloudEligible &&
    !isPromptReadAloudSuppressed &&
    !isEvaluating &&
    displayText.trim().length > 0
  // Do not re-run word reveal (or switch sync→tokens) when submitting / AI is evaluating — keep full text stable.
  const shouldAnimateQuestionPrompt =
    ['short_text', 'long_text'].includes(question.type) &&
    isReadAloudActive &&
    !isPromptReadAloudSuppressed &&
    !isEvaluating
  const shouldAnimatePrompt = shouldAnimateQuestionPrompt
  const shouldSyncPromptToAudio =
    shouldAnimatePrompt &&
    shouldPreparePromptForAudio &&
    voice.state === 'idle'
  const questionCharCount = displayText.length
  const descriptionCharCount = displayDescription?.length ?? 0
  const totalPromptCharCount = questionCharCount + descriptionCharCount
  const {
    questionTokens,
    descriptionTokens,
    visibleQuestionTokenCount,
    visibleDescriptionTokenCount,
    revealComplete: followUpWordsComplete,
  } = useFollowUpWordReveal(
    displayText,
    displayDescription,
    shouldAnimatePrompt && !shouldSyncPromptToAudio,
    isFollowUp ? followUpRevealKey : mainQuestionRevealKey,
    undefined,
    revealTiming
  )
  const audioSyncedVisibleQuestionText = displayText.slice(
    0,
    Math.min(audioSyncedVisibleChars, questionCharCount)
  )
  const audioSyncedVisibleDescriptionText =
    displayDescription && audioSyncedVisibleChars > questionCharCount
      ? displayDescription.slice(0, audioSyncedVisibleChars - questionCharCount)
      : ''
  const shouldHoldPromptBlankForAudio =
    !isFollowUp &&
    shouldSyncPromptToAudio &&
    (audioPromptPhase === 'preparing' ||
      (audioPromptPhase === 'playing' && audioSyncedVisibleChars === 0))

  const showVoiceHub =
    voice.isSupported &&
    isTextareaQuestion &&
    (voice.state !== 'idle' || (!textInputChosen && answer.trim() === ''))
  const isChoiceWithOther =
    (question.type === 'multiple_choice' || question.type === 'dropdown') &&
    (question.allow_other_option ?? false)
  const otherOptionLabel = question.other_option_label?.trim() || 'Others'
  const choiceOptions = useMemo(() => {
    const base = question.options ?? []
    if (!isChoiceWithOther || base.includes(otherOptionLabel)) return base
    return [...base, otherOptionLabel]
  }, [question.options, isChoiceWithOther, otherOptionLabel])

  useLayoutEffect(() => {
    setTextInputChosen(false)
    setAudioPromptPhase(shouldPreparePromptForAudio ? 'preparing' : 'idle')
    setAudioSyncedVisibleChars(0)
  }, [promptAudioKey, shouldPreparePromptForAudio])

  useEffect(() => {
    if (isFollowUp) {
      setAnswer('')
      setSelectedOptions([])
      setOtherOptionText('')
      setRatingValue(null)
      setLegalChecked(false)
      return
    }

    if (question.type === 'legal') {
      const stored = (prefillMainAnswer ?? '').trim()
      setLegalChecked(stored === 'Yes' || stored.toLowerCase() === 'accepted')
      setAnswer('')
      setSelectedOptions([])
      setOtherOptionText('')
      setRatingValue(null)
      return
    }

    const stored = (prefillMainAnswer ?? '').trim()
    if (!stored || question.type === 'statement') {
      setAnswer('')
      setSelectedOptions([])
      setOtherOptionText('')
      setRatingValue(null)
      setLegalChecked(false)
      textareaRef.current?.focus()
      lineInputRef.current?.focus()
      return
    }

    if (
      question.type === 'short_text' ||
      question.type === 'long_text' ||
      question.type === 'number' ||
      isContactInputType(question.type)
    ) {
      setAnswer(stored)
      setSelectedOptions([])
      setOtherOptionText('')
      setRatingValue(null)
    } else if (question.type === 'dropdown') {
      if (isChoiceWithOther) {
        const parsedOther = parseOtherAnswer(stored, otherOptionLabel)
        if (parsedOther.selectedOther) {
          setAnswer(otherOptionLabel)
          setOtherOptionText(parsedOther.otherText)
        } else {
          setAnswer(stored)
          setOtherOptionText('')
        }
      } else {
        setAnswer(stored)
        setOtherOptionText('')
      }
      setSelectedOptions([])
      setRatingValue(null)
    } else if (question.type === 'multiple_choice' && choiceOptions.length > 0) {
      let otherText = ''
      let storedWithoutOther = stored
      const otherPrefix = `${otherOptionLabel}:`
      const otherPrefixIndex = isChoiceWithOther
        ? stored.toLowerCase().indexOf(otherPrefix.toLowerCase())
        : -1

      if (otherPrefixIndex >= 0) {
        otherText = stored.slice(otherPrefixIndex + otherPrefix.length).trim()
        storedWithoutOther = stored.slice(0, otherPrefixIndex).replace(/,\s*$/, '').trim()
      }

      const parts = question.allow_multiple
        ? storedWithoutOther.split(/\s*,\s*/).map(s => s.trim()).filter(Boolean)
        : [storedWithoutOther.trim()].filter(Boolean)

      if (
        isChoiceWithOther &&
        (otherPrefixIndex >= 0 || startsWithIgnoreCase(stored, otherOptionLabel)) &&
        !parts.includes(otherOptionLabel)
      ) {
        parts.push(otherOptionLabel)
      }

      const valid = parts.filter(p => choiceOptions.includes(p))
      setSelectedOptions(valid.length ? valid : parts)
      setOtherOptionText(otherText)
      setAnswer('')
      setRatingValue(null)
    } else if (question.type === 'yes_no') {
      setAnswer(stored === 'Yes' || stored === 'No' ? stored : '')
      setSelectedOptions([])
      setOtherOptionText('')
      setRatingValue(null)
    } else if (['rating', 'nps', 'opinion_scale'].includes(question.type)) {
      const n = Number(stored)
      setRatingValue(Number.isFinite(n) ? n : null)
      setAnswer('')
      setSelectedOptions([])
      setOtherOptionText('')
    } else {
      setAnswer(stored)
      setSelectedOptions([])
      setOtherOptionText('')
      setRatingValue(null)
    }
    if (question.type === 'long_text' || question.type === 'short_text') {
      textareaRef.current?.focus()
    } else {
      lineInputRef.current?.focus()
    }
  }, [
    displayText,
    prefillMainAnswer,
    navigationEpoch,
    isFollowUp,
    question.type,
    question.options,
    question.allow_multiple,
    question.allow_other_option,
    question.other_option_label,
    choiceOptions,
    isChoiceWithOther,
    otherOptionLabel,
  ])

  const syncTextareaHeight = useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    if (question.type !== 'short_text' && question.type !== 'long_text') return
    const minPx = question.type === 'long_text' ? 176 : 144
    const maxPx = question.type === 'long_text' ? 440 : 280
    el.style.height = 'auto'
    const natural = el.scrollHeight
    const h = Math.max(minPx, Math.min(natural, maxPx))
    el.style.height = `${h}px`
    el.style.overflowY = natural > maxPx ? 'auto' : 'hidden'
  }, [question.type])

  useLayoutEffect(() => {
    if (!isTextareaQuestion) return
    if (showVoiceHub && voice.state === 'idle') return
    syncTextareaHeight()
  }, [
    syncTextareaHeight,
    answer,
    voice.state,
    voice.interimText,
    navigationEpoch,
    displayText,
    question.type,
    isFollowUp,
    isEvaluating,
    showVoiceHub,
    isTextareaQuestion,
  ])

  useEffect(() => {
    if (textInputChosen && isTextareaQuestion) {
      textareaRef.current?.focus()
    }
  }, [textInputChosen, isTextareaQuestion])

  useEffect(() => {
    if (readAloudDisabled) {
      setReadAloudEnabled(false)
      return
    }
    if (typeof window === 'undefined') return
    const stored = window.sessionStorage.getItem(storageKey)
    if (stored === null) {
      setReadAloudEnabled(readAloudDefaultEnabled)
      return
    }
    setReadAloudEnabled(stored === '1')
  }, [readAloudDefaultEnabled, readAloudDisabled, storageKey])

  useEffect(() => {
    if (readAloudDisabled) return
    if (typeof window === 'undefined') return
    window.sessionStorage.setItem(storageKey, readAloudEnabled ? '1' : '0')
  }, [readAloudEnabled, readAloudDisabled, storageKey])

  useEffect(() => {
    if (typeof window === 'undefined' || !isReadAloudSupported) return

    let cancelled = false
    let controller: AbortController | null = null
    let unlockHandler: (() => void) | null = null

    const stopPlayback = () => {
      controller?.abort()
      if (unlockHandler) {
        window.removeEventListener('pointerdown', unlockHandler)
        window.removeEventListener('touchend', unlockHandler)
        unlockHandler = null
      }
      if (audioRevealFrameRef.current !== null) {
        window.cancelAnimationFrame(audioRevealFrameRef.current)
        audioRevealFrameRef.current = null
      }
      if (readAloudAudioRef.current) {
        readAloudAudioRef.current.pause()
        readAloudAudioRef.current.src = ''
        readAloudAudioRef.current = null
      }
      if (readAloudObjectUrlRef.current) {
        URL.revokeObjectURL(readAloudObjectUrlRef.current)
        readAloudObjectUrlRef.current = null
      }
    }

    const shouldSpeak =
      isReadAloudActive &&
      readAloudEligible &&
      !isPromptReadAloudSuppressed &&
      !isEvaluating &&
      voice.state === 'idle' &&
      displayText.trim().length > 0

    const fetchSpeechAudio = async (signal: AbortSignal) => {
      const run = async () =>
        fetch(`${supabaseUrl}/functions/v1/text-to-speech`, {
          method: 'POST',
          headers: edgeFunctionAnonHeaders(),
          body: JSON.stringify({
            text: displayText,
            language,
          }),
          signal,
        })
      let response = await run()
      // First question on mobile can hit cold starts. Retry once quickly.
      if (!response.ok && !signal.aborted) {
        await new Promise(resolve => window.setTimeout(resolve, 250))
        response = await run()
      }
      return response
    }

    const speak = async () => {
      if (!shouldSpeak) {
        stopPlayback()
        return
      }

      stopPlayback()
      controller = new AbortController()
      setAudioSyncedVisibleChars(0)
      setAudioPromptPhase('preparing')

      try {
        const response = await fetchSpeechAudio(controller.signal)
        if (!response.ok || cancelled) {
          setAudioPromptPhase('fallback')
          setAudioSyncedVisibleChars(totalPromptCharCount)
          return
        }

        const audioBlob = await response.blob()
        if (cancelled) return

        const objectUrl = URL.createObjectURL(audioBlob)
        readAloudObjectUrlRef.current = objectUrl
        const audio = new Audio(objectUrl)
        audio.preload = 'auto'
        readAloudAudioRef.current = audio
        const syncRevealToAudioClock = () => {
          if (cancelled) return
          const hasTiming = Number.isFinite(audio.duration) && audio.duration > 0
          const progress = hasTiming
            ? Math.max(0, Math.min(1, audio.currentTime / audio.duration))
            : 0
          const acceleratedProgress =
            progress <= 0 ? 0 : 1 - Math.pow(1 - progress, 1.7)
          const charsToShow = Math.floor(acceleratedProgress * totalPromptCharCount)
          setAudioSyncedVisibleChars(charsToShow)
          if (!audio.paused && !audio.ended) {
            audioRevealFrameRef.current = window.requestAnimationFrame(syncRevealToAudioClock)
          }
        }
        const handlePlay = () => {
          setAudioPromptPhase('playing')
          setAudioSyncedVisibleChars(prev => Math.max(prev, Math.min(1, totalPromptCharCount)))
          if (audioRevealFrameRef.current !== null) {
            window.cancelAnimationFrame(audioRevealFrameRef.current)
          }
          audioRevealFrameRef.current = window.requestAnimationFrame(syncRevealToAudioClock)
        }
        const handleEnded = () => {
          setAudioPromptPhase('done')
          if (audioRevealFrameRef.current !== null) {
            window.cancelAnimationFrame(audioRevealFrameRef.current)
            audioRevealFrameRef.current = null
          }
          setAudioSyncedVisibleChars(totalPromptCharCount)
        }
        const handlePause = () => {
          if (audioRevealFrameRef.current !== null) {
            window.cancelAnimationFrame(audioRevealFrameRef.current)
            audioRevealFrameRef.current = null
          }
        }
        audio.addEventListener('play', handlePlay)
        audio.addEventListener('pause', handlePause)
        audio.addEventListener('ended', handleEnded, { once: true })
        await audio.play().catch(() => {
          setAudioPromptPhase('fallback')
          setAudioSyncedVisibleChars(totalPromptCharCount)
          // If autoplay is blocked on first load, attempt once on next touch.
          unlockHandler = () => {
            void audio.play().then(() => {
              setAudioPromptPhase('playing')
            }).catch(() => {
              setAudioPromptPhase('fallback')
              setAudioSyncedVisibleChars(totalPromptCharCount)
            }).finally(() => {
              if (unlockHandler) {
                window.removeEventListener('pointerdown', unlockHandler)
                window.removeEventListener('touchend', unlockHandler)
                unlockHandler = null
              }
            })
          }
          window.addEventListener('pointerdown', unlockHandler, { once: true })
          window.addEventListener('touchend', unlockHandler, { once: true })
        })
      } catch {
        setAudioPromptPhase('fallback')
        setAudioSyncedVisibleChars(totalPromptCharCount)
      }
    }

    void speak()

    return () => {
      cancelled = true
      stopPlayback()
    }
  }, [
    displayText,
    isEvaluating,
    isReadAloudSupported,
    language,
    navigationEpoch,
    readAloudEligible,
    isReadAloudActive,
    isPromptReadAloudSuppressed,
    supabaseUrl,
    totalPromptCharCount,
    voice.state,
  ])

  useEffect(() => {
    if (!isFollowUp || !followUpWordsComplete) return
    textareaRef.current?.focus()
    lineInputRef.current?.focus()
  }, [isFollowUp, followUpWordsComplete, followUpRevealKey])

  const isTextType =
    question.type === 'short_text' ||
    question.type === 'long_text' ||
    isContactInputType(question.type) ||
    question.type === 'number'
  const isId = language === 'id'

  const handleSubmit = useCallback(() => {
    let value = ''
    if (question.type === 'dropdown') {
      if (isChoiceWithOther && answer === otherOptionLabel) {
        const typed = otherOptionText.trim()
        value = typed ? `${otherOptionLabel}: ${typed}` : otherOptionLabel
      } else {
        value = answer.trim()
      }
    } else if (isTextType) {
      value = answer.trim()
    } else if (question.type === 'multiple_choice') {
      const typed = otherOptionText.trim()
      value = selectedOptions
        .map(opt => {
          if (opt !== otherOptionLabel || !isChoiceWithOther) return opt
          return typed ? `${otherOptionLabel}: ${typed}` : otherOptionLabel
        })
        .join(', ')
    } else if (question.type === 'yes_no') {
      value = answer
    } else if (['rating', 'nps', 'opinion_scale'].includes(question.type)) {
      value = ratingValue !== null ? String(ratingValue) : ''
    } else if (question.type === 'legal') {
      value = legalChecked ? 'Yes' : ''
    } else if (question.type === 'statement') {
      value = '(acknowledged)'
    } else {
      value = answer.trim()
    }

    if (!value && question.required && question.type !== 'statement') return
    onSubmit(value)
  }, [
    answer,
    isChoiceWithOther,
    isTextType,
    otherOptionLabel,
    otherOptionText,
    onSubmit,
    question.required,
    question.type,
    ratingValue,
    selectedOptions,
    legalChecked,
  ])

  const canSubmit = useCallback(() => {
    if (question.type === 'statement') return true

    if (question.type === 'dropdown') {
      if (!answer.trim()) return !question.required
      if (isChoiceWithOther && answer === otherOptionLabel && (question.require_other_text ?? false)) {
        return otherOptionText.trim().length > 0
      }
      return true
    }

    if (question.type === 'multiple_choice') {
      if (selectedOptions.length === 0) return !question.required
      if (
        isChoiceWithOther &&
        selectedOptions.includes(otherOptionLabel) &&
        (question.require_other_text ?? false)
      ) {
        return otherOptionText.trim().length > 0
      }
      return true
    }

    if (!question.required) return true
    if (question.type === 'legal') return legalChecked
    if (isTextType) return answer.trim().length > 0
    if (question.type === 'yes_no') return answer !== ''
    if (['rating', 'nps', 'opinion_scale'].includes(question.type)) return ratingValue !== null
    return true
  }, [
    answer,
    isChoiceWithOther,
    isTextType,
    legalChecked,
    otherOptionLabel,
    otherOptionText,
    question.require_other_text,
    question.required,
    question.type,
    ratingValue,
    selectedOptions,
  ])

  const handleSubmitRef = useRef(handleSubmit)
  handleSubmitRef.current = handleSubmit
  const canSubmitRef = useRef(canSubmit)
  canSubmitRef.current = canSubmit

  /** Enter submits from anywhere (capture), with correct rules per question type. */
  useEffect(() => {
    if (isEvaluating) return undefined

    const onDocKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || e.isComposing) return
      if (!canSubmitRef.current()) return

      const el = document.activeElement as HTMLElement | null
      const tag = el?.tagName ?? ''

      if (question.type === 'long_text') {
        if (tag === 'TEXTAREA' && (e.ctrlKey || e.metaKey)) {
          e.preventDefault()
          e.stopImmediatePropagation()
          handleSubmitRef.current()
        }
        return
      }

      if (
        question.type === 'short_text' ||
        isContactInputType(question.type) ||
        question.type === 'number' ||
        question.type === 'dropdown'
      ) {
        if (question.type === 'short_text' && e.shiftKey) return
        e.preventDefault()
        e.stopImmediatePropagation()
        handleSubmitRef.current()
        return
      }

      if (tag === 'TEXTAREA' || tag === 'SELECT') return
      if (tag === 'INPUT') {
        const t = (el as HTMLInputElement).type
        if (t === 'checkbox') return
        if (t === 'text' || t === 'search' || t === 'url' || t === 'email' || t === 'password' || t === 'tel' || t === 'date' || t === 'number') return
      }

      e.preventDefault()
      e.stopImmediatePropagation()
      handleSubmitRef.current()
    }

    document.addEventListener('keydown', onDocKeyDown, true)
    return () => document.removeEventListener('keydown', onDocKeyDown, true)
  }, [isEvaluating, question.type])

  const enterHint = useMemo(() => {
    if (isId) {
      if (question.type === 'long_text') {
        return '⌘/Ctrl+Enter untuk kirim · Shift+Enter baris baru'
      }
      return 'tekan Enter ↵'
    }
    if (question.type === 'long_text') {
      return '⌘/Ctrl+Enter to submit · Shift+Enter new line'
    }
    return 'press Enter ↵'
  }, [isId, question.type])

  const toggleOption = (opt: string) => {
    if (question.allow_multiple) {
      setSelectedOptions(prev => {
        const next = prev.includes(opt) ? prev.filter(o => o !== opt) : [...prev, opt]
        if (!next.includes(otherOptionLabel)) {
          setOtherOptionText('')
        }
        return next
      })
    } else {
      setSelectedOptions([opt])
      if (opt !== otherOptionLabel) {
        setOtherOptionText('')
      }
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden scroll-smooth animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Row flex + m-auto: vertical center when content is short; when tall, block grows from the top so full scroll works (justify-center can clip the question). */}
      <div className="flex min-h-full w-full shrink-0">
        <div
          className={cn(
            'm-auto w-full max-w-xl px-6 py-6 sm:py-7',
            !isFollowUp && isTextareaQuestion && imageUrl?.trim() ? 'space-y-3' : 'space-y-6'
          )}
        >
        {!readAloudDisabled && (
        <div className="flex items-center">
          <label
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground',
              isReadAloudSupported ? 'cursor-pointer hover:bg-muted/60' : 'cursor-not-allowed opacity-60'
            )}
          >
            <input
              type="checkbox"
              checked={readAloudEnabled}
              onChange={(e) => setReadAloudEnabled(e.currentTarget.checked)}
              disabled={!isReadAloudSupported}
              className="h-3.5 w-3.5 rounded border-input accent-primary"
            />
            <Volume2 className="h-3.5 w-3.5" />
            <span>{isId ? 'AI Bacakan' : 'AI Read aloud'}</span>
          </label>
        </div>
        )}

        {!isFollowUp && isTextareaQuestion && imageUrl?.trim() ? (
          <div className="mx-auto shrink-0 aspect-square w-36 overflow-hidden rounded-xl border border-border/80 bg-muted/20 sm:w-44 md:w-52">
            <img
              src={imageUrl.trim()}
              alt=""
              loading="lazy"
              className="h-full w-full object-cover"
            />
          </div>
        ) : null}

        {/* Question */}
        <div aria-busy={shouldAnimatePrompt && !followUpWordsComplete}>
          <p className="mb-2 text-sm font-medium text-primary">
            {isFollowUp ? '' : `${questionNumber} →`}
          </p>
          {shouldHoldPromptBlankForAudio ? (
            <div className="min-h-[4.5rem] sm:min-h-[5.5rem]" aria-hidden="true" />
          ) : shouldSyncPromptToAudio ? (
            <div
              role="heading"
              aria-level={2}
              aria-label={[displayText, displayDescription].filter(Boolean).join('. ')}
              className="space-y-2"
            >
              <p className="text-xl font-semibold leading-snug tracking-tight text-foreground sm:text-2xl">
                {audioSyncedVisibleQuestionText}
              </p>
              {displayDescription && audioSyncedVisibleDescriptionText ? (
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {audioSyncedVisibleDescriptionText}
                </p>
              ) : null}
            </div>
          ) : shouldAnimatePrompt ? (
            <div
              role="heading"
              aria-level={2}
              aria-label={[displayText, displayDescription].filter(Boolean).join('. ')}
              className="space-y-2"
            >
              <p className="text-xl font-semibold leading-snug tracking-tight text-foreground sm:text-2xl">
                {questionTokens.slice(0, visibleQuestionTokenCount).map((tok, idx) => {
                  const spaceOnly = /^\s+$/.test(tok)
                  return (
                    <span
                      key={`${followUpRevealKey}-q-${idx}`}
                      className={cn(
                        'inline',
                        !spaceOnly &&
                          'animate-in fade-in slide-in-from-bottom-1 duration-200'
                      )}
                    >
                      {tok}
                    </span>
                  )
                })}
              </p>
              {descriptionTokens.length > 0 && visibleDescriptionTokenCount > 0 ? (
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {descriptionTokens.slice(0, visibleDescriptionTokenCount).map((tok, idx) => {
                    const spaceOnly = /^\s+$/.test(tok)
                    return (
                      <span
                        key={`${followUpRevealKey}-d-${idx}`}
                        className={cn(
                          'inline',
                          !spaceOnly &&
                            'animate-in fade-in slide-in-from-bottom-1 duration-200'
                        )}
                      >
                        {tok}
                      </span>
                    )
                  })}
                </p>
              ) : null}
            </div>
          ) : (
            <>
              <h2 className="text-xl font-semibold leading-snug tracking-tight sm:text-2xl">
                {displayText}
              </h2>
              {displayDescription ? (
                <p className="mt-2 text-sm text-muted-foreground">{displayDescription}</p>
              ) : null}
            </>
          )}
        </div>

        {/* Answer input — varies by type */}
        {isTextareaQuestion && showVoiceHub && voice.state === 'idle' && (
          <div className="relative mx-auto flex w-full max-w-md flex-col items-center py-6 sm:py-10">
            <button
              type="button"
              onClick={handleStartRecording}
              disabled={isEvaluating}
              className="flex h-28 w-28 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary shadow-sm ring-4 ring-primary/15 transition-transform hover:bg-primary/20 hover:ring-primary/25 disabled:opacity-50 sm:h-32 sm:w-32"
              aria-label={isId ? 'Mulai merekam' : 'Start recording'}
            >
              <Mic className="h-12 w-12 sm:h-14 sm:w-14" strokeWidth={1.5} />
            </button>
            <p className="mt-5 text-sm font-medium text-foreground">
              {isId ? 'Mulai merekam' : 'Start recording'}
            </p>
            <p className="mt-1 max-w-xs text-center text-xs text-muted-foreground">
              {isId ? 'Atau ketuk keyboard untuk mengetik.' : 'Or tap the keyboard to type instead.'}
            </p>
            <button
              type="button"
              onClick={() => setTextInputChosen(true)}
              disabled={isEvaluating}
              className="absolute right-0 top-6 rounded-xl p-3 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:top-10"
              aria-label={isId ? 'Ketik jawaban' : 'Type answer with keyboard'}
            >
              <Keyboard className="h-6 w-6 sm:h-7 sm:w-7" />
            </button>
          </div>
        )}

        {isTextareaQuestion && showVoiceHub && voice.state === 'recording' && (
          <div className="relative mx-auto flex w-full max-w-md flex-col items-center py-6 sm:py-10">
            <div className="flex flex-col items-center gap-4 sm:flex-row sm:gap-6">
              <button
                type="button"
                onClick={() => voice.cancelRecording()}
                className="order-2 rounded-full border border-input bg-background px-4 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted sm:order-1"
              >
                {isId ? 'Batal' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={() => voice.stopRecording()}
                className="relative order-1 flex h-28 w-28 shrink-0 items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow-md transition-transform hover:scale-[1.02] active:scale-[0.98] sm:order-2 sm:h-32 sm:w-32"
                aria-label={isId ? 'Selesai merekam' : 'Stop recording'}
              >
                <span className="absolute inset-0 animate-ping rounded-full bg-destructive/25" />
                <Square className="relative h-8 w-8 fill-current" />
              </button>
            </div>
            {voice.interimText ? (
              <p className="mt-6 max-w-md text-center text-sm text-muted-foreground">{voice.interimText}</p>
            ) : null}
          </div>
        )}

        {isTextareaQuestion && showVoiceHub && voice.state === 'transcribing' && (
          <div className="mx-auto flex w-full max-w-md flex-col items-center py-10">
            <div className="flex h-28 w-28 items-center justify-center rounded-full bg-muted text-primary sm:h-32 sm:w-32">
              <Loader2 className="h-10 w-10 animate-spin" />
            </div>
            <p className="mt-5 text-sm text-muted-foreground">
              {isId ? 'Mentranskripsi…' : 'Transcribing…'}
            </p>
          </div>
        )}

        {isTextareaQuestion && !showVoiceHub && (
          <div className="space-y-2">
            {voice.isSupported && textInputChosen && answer.trim() === '' && (
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setTextInputChosen(false)
                    voice.cancelRecording()
                  }}
                  disabled={isEvaluating || voice.state !== 'idle'}
                  className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-primary hover:bg-primary/10 disabled:opacity-50"
                >
                  <Mic className="h-3.5 w-3.5" />
                  {isId ? 'Kembali ke mikrofon' : 'Back to microphone'}
                </button>
              </div>
            )}
            <div className="relative">
              <textarea
                ref={textareaRef}
                value={voice.state === 'recording' ? (answer + ' ' + voice.interimText).trim() : answer}
                onChange={e => setAnswer(e.target.value)}
                rows={question.type === 'long_text' ? 5 : 4}
                placeholder={isId ? 'Ketik jawaban Anda...' : 'Type your answer here...'}
                disabled={isEvaluating}
                className="w-full resize-none rounded-lg border border-input bg-transparent px-4 py-3 pr-12 text-base leading-relaxed shadow-sm transition-[height] placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
              />
              {voice.isSupported && (
                <div className="absolute bottom-3 right-3">
                  <VoiceRecorder
                    state={voice.state}
                    onStart={handleStartRecording}
                    onStop={voice.stopRecording}
                    onCancel={voice.cancelRecording}
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {isContactInputType(question.type) && (
          <input
            ref={el => {
              lineInputRef.current = el
            }}
            type={question.type === 'phone' ? 'tel' : question.type}
            value={answer}
            onChange={e => setAnswer(e.target.value)}
            placeholder={
              question.type === 'email'
                ? isId
                  ? 'nama@email.com'
                  : 'name@example.com'
                : question.type === 'url'
                  ? isId
                    ? 'https://...'
                    : 'https://...'
                  : question.type === 'phone'
                    ? isId
                      ? '+62 ...'
                      : '+1 ...'
                    : isId
                      ? 'YYYY-MM-DD'
                      : 'YYYY-MM-DD'
            }
            disabled={isEvaluating}
            className="w-full rounded-lg border border-input bg-transparent px-4 py-3 text-base shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          />
        )}

        {question.type === 'number' && (
          <input
            ref={el => {
              lineInputRef.current = el
            }}
            type="number"
            value={answer}
            onChange={e => setAnswer(e.target.value)}
            placeholder={isId ? 'Ketik angka...' : 'Type a number...'}
            disabled={isEvaluating}
            className="w-full rounded-lg border border-input bg-transparent px-4 py-3 text-base shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        )}

        {question.type === 'dropdown' && choiceOptions.length > 0 && (
          <div className="space-y-2">
            <select
              ref={el => {
                lineInputRef.current = el
              }}
              value={answer}
              onChange={e => {
                const nextValue = e.target.value
                setAnswer(nextValue)
                if (nextValue !== otherOptionLabel) setOtherOptionText('')
              }}
              disabled={isEvaluating}
              className="w-full rounded-lg border border-input bg-transparent px-4 py-3 text-base shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            >
              <option value="">
                {isId ? 'Pilih opsi…' : 'Select an option…'}
              </option>
              {choiceOptions.map(opt => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
            {isChoiceWithOther && answer === otherOptionLabel && (
              <input
                type="text"
                value={otherOptionText}
                onChange={e => setOtherOptionText(e.target.value)}
                placeholder={isId ? 'Mohon jelaskan...' : 'Please specify...'}
                disabled={isEvaluating}
                className="w-full rounded-lg border border-input bg-transparent px-4 py-2.5 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
              />
            )}
          </div>
        )}

        {question.type === 'multiple_choice' && choiceOptions.length > 0 && (
          <div
            className="min-h-0 max-h-[min(60vh,28rem)] space-y-2 overflow-y-auto overscroll-y-contain pr-0.5 [-webkit-overflow-scrolling:touch]"
            role="group"
            aria-label={isId ? 'Opsi jawaban' : 'Answer choices'}
          >
            {choiceOptions.map((opt, i) => (
              <button
                key={opt}
                type="button"
                onClick={() => toggleOption(opt)}
                disabled={isEvaluating}
                className={cn(
                  'flex w-full items-center gap-3 rounded-lg border px-4 py-3 text-left text-sm transition-all hover:border-primary/50 hover:bg-primary/5',
                  selectedOptions.includes(opt)
                    ? 'border-primary bg-primary/10 font-medium'
                    : 'border-input'
                )}
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded border text-xs font-medium">
                  {String.fromCharCode(65 + i)}
                </span>
                <span className="flex-1">{opt}</span>
                {selectedOptions.includes(opt) && (
                  <Check className="h-4 w-4 text-primary" />
                )}
              </button>
            ))}

            {isChoiceWithOther && selectedOptions.includes(otherOptionLabel) && (
              <input
                type="text"
                value={otherOptionText}
                onChange={e => setOtherOptionText(e.target.value)}
                placeholder={isId ? 'Mohon jelaskan...' : 'Please specify...'}
                disabled={isEvaluating}
                className="w-full rounded-lg border border-input bg-transparent px-4 py-2.5 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
              />
            )}
          </div>
        )}

        {question.type === 'yes_no' && (
          <div className="flex gap-3">
            {[
              { value: 'Yes', label: isId ? 'Ya' : 'Yes' },
              { value: 'No', label: isId ? 'Tidak' : 'No' },
            ].map(opt => (
              <button
                key={opt.value}
                onClick={() => setAnswer(opt.value)}
                disabled={isEvaluating}
                className={cn(
                  'flex-1 rounded-lg border px-6 py-4 text-center text-base font-medium transition-all hover:border-primary/50 hover:bg-primary/5',
                  answer === opt.value
                    ? 'border-primary bg-primary/10'
                    : 'border-input'
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}

        {question.type === 'nps' && (
          <div>
            <div className="flex justify-between gap-1 sm:gap-1.5">
              {Array.from({ length: 11 }, (_, i) => (
                <button
                  key={i}
                  onClick={() => setRatingValue(i)}
                  disabled={isEvaluating}
                  className={cn(
                    'flex h-10 w-full items-center justify-center rounded-md border text-sm font-medium transition-all hover:border-primary/50 hover:bg-primary/5 sm:h-12',
                    ratingValue === i
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-input'
                  )}
                >
                  {i}
                </button>
              ))}
            </div>
            <div className="mt-2 flex justify-between text-xs text-muted-foreground">
              <span>{isId ? 'Tidak mungkin' : 'Not at all likely'}</span>
              <span>{isId ? 'Sangat mungkin' : 'Extremely likely'}</span>
            </div>
          </div>
        )}

        {(question.type === 'rating' || question.type === 'opinion_scale') && (
          <div>
            <div className="flex justify-between gap-1.5 sm:gap-2">
              {Array.from(
                { length: (question.scale?.max ?? 5) - (question.scale?.min ?? 1) + 1 },
                (_, i) => (question.scale?.min ?? 1) + i
              ).map(val => (
                <button
                  key={val}
                  onClick={() => setRatingValue(val)}
                  disabled={isEvaluating}
                  className={cn(
                    'flex h-12 w-full items-center justify-center rounded-md border text-sm font-medium transition-all hover:border-primary/50 hover:bg-primary/5',
                    ratingValue === val
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-input'
                  )}
                >
                  {val}
                </button>
              ))}
            </div>
            {(question.scale?.min_label || question.scale?.max_label) && (
              <div className="mt-2 flex justify-between text-xs text-muted-foreground">
                <span>{question.scale?.min_label ?? ''}</span>
                <span>{question.scale?.max_label ?? ''}</span>
              </div>
            )}
          </div>
        )}

        {question.type === 'statement' && (
          <p className="text-muted-foreground">
            {isId ? 'Tekan OK untuk lanjut.' : 'Press OK to continue.'}
          </p>
        )}

        {question.type === 'legal' && (
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-input p-4">
            <input
              type="checkbox"
              checked={legalChecked}
              onChange={e => setLegalChecked(e.target.checked)}
              disabled={isEvaluating}
              className="mt-1 h-4 w-4 rounded border-input accent-primary"
            />
            <span className="text-sm leading-relaxed text-muted-foreground">
              {isId ? 'Centang untuk menyetujui dan melanjutkan.' : 'Check to agree and continue.'}
            </span>
          </label>
        )}

        {/* Submit */}
        <div className="flex items-center gap-3">
          <Button
            onClick={handleSubmit}
            disabled={!canSubmit() || isEvaluating}
            className="gap-2"
          >
            {isEvaluating ? (
              <span className="flex items-center gap-2">
                <span
                  className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent"
                  aria-hidden
                />
                {isId ? 'Memproses...' : 'Processing...'}
              </span>
            ) : (
              <>
                OK <Check className="h-4 w-4" />
              </>
            )}
          </Button>
          {isEvaluating && (
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-gold/30 bg-gold/10 shadow-sm motion-safe:animate-ai-thinking"
              aria-hidden
            >
              <Sparkles className="h-4 w-4 text-gold-dark" strokeWidth={2} />
            </span>
          )}
          {!isEvaluating && (
            <span className="text-xs text-muted-foreground">{enterHint}</span>
          )}
        </div>
        </div>
      </div>
    </div>
  )
}
