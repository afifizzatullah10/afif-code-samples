import { useState, useRef, useCallback, useEffect } from 'react'
import { edgeFunctionAnonFormHeaders } from '@/lib/edgeFunctionHeaders'

type VoiceState = 'idle' | 'recording' | 'transcribing'

interface UseVoiceInputOptions {
  language: 'en' | 'id'
  supabaseUrl: string
  onTranscript: (text: string) => void
}

interface SpeechRecognitionEvent {
  results: SpeechRecognitionResultList
  resultIndex: number
}

interface SpeechRecognitionErrorEvent {
  error: string
}

const MAX_RECORDING_MS = 30000

export function useVoiceInput({ language, supabaseUrl, onTranscript }: UseVoiceInputOptions) {
  const [state, setState] = useState<VoiceState>('idle')
  const [interimText, setInterimText] = useState('')
  const [error, setError] = useState<string | null>(null)

  const recognitionRef = useRef<InstanceType<typeof SpeechRecognition> | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const shouldContinueRecognitionRef = useRef(false)
  const lastInterimRef = useRef('')
  const restartCountRef = useRef(0)
  const startingRef = useRef(false)
  const usingMediaFallbackRef = useRef(false)
  const startMediaRecorderRef = useRef<() => void>(() => {})

  const hasNativeSpeech = typeof window !== 'undefined' &&
    ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)
  const hasMediaRecorderSupport = typeof window !== 'undefined' &&
    typeof MediaRecorder !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''
  const isIPadOrTouchMac =
    typeof navigator !== 'undefined' &&
    (navigator.platform === 'iPad' || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1))
  const isMobileUAPattern = typeof navigator !== 'undefined' && (
    /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(ua) ||
    /CriOS|FxiOS|EdgiOS|OPiOS|OPT\/|DuckDuckGo/i.test(ua)
  )
  const isCoarsePointer = typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(pointer:coarse)').matches
  // Prefer server transcription (MediaRecorder) on phones/tablets; native SpeechRecognition
  // is unreliable across iOS + question transitions, and iPad often misreports as desktop.
  const preferMediaOverNative =
    hasMediaRecorderSupport && (isMobileUAPattern || isIPadOrTouchMac || isCoarsePointer)
  const useNativeSpeech = hasNativeSpeech && !preferMediaOverNative

  const cleanup = useCallback(() => {
    shouldContinueRecognitionRef.current = false
    lastInterimRef.current = ''
    restartCountRef.current = 0
    startingRef.current = false
    usingMediaFallbackRef.current = false
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
    if (recognitionRef.current) {
      try { recognitionRef.current.abort() } catch { /* ignore */ }
      recognitionRef.current = null
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try { mediaRecorderRef.current.stop() } catch { /* ignore */ }
    }
    mediaRecorderRef.current = null
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
    chunksRef.current = []
    setInterimText('')
  }, [])

  useEffect(() => {
    return cleanup
  }, [cleanup])

  const startNativeSpeech = useCallback(() => {
    const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognitionAPI) return
    shouldContinueRecognitionRef.current = true
    restartCountRef.current = 0
    usingMediaFallbackRef.current = false

    const startSession = () => {
      const recognition = new SpeechRecognitionAPI()
      recognition.lang = language === 'id' ? 'id-ID' : 'en-US'
      recognition.interimResults = true
      recognition.continuous = true
      recognition.maxAlternatives = 1

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        let interim = ''
        let final = ''
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript
          if (event.results[i].isFinal) {
            final += transcript
          } else {
            interim += transcript
          }
        }
        lastInterimRef.current = interim.trim()
        if (final) {
          onTranscript(final)
          setInterimText('')
          lastInterimRef.current = ''
        } else {
          setInterimText(interim)
        }
      }

      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        if (event.error === 'no-speech') return
        if (event.error === 'aborted' && !shouldContinueRecognitionRef.current) return
        if (
          shouldContinueRecognitionRef.current &&
          !usingMediaFallbackRef.current &&
          (event.error === 'network' || event.error === 'audio-capture' || event.error === 'service-not-allowed')
        ) {
          usingMediaFallbackRef.current = true
          try { recognition.abort() } catch { /* ignore */ }
          recognitionRef.current = null
          setInterimText('')
          startMediaRecorderRef.current()
          return
        }
        shouldContinueRecognitionRef.current = false
        setError('Speech recognition failed. Try typing instead.')
        setState('idle')
        cleanup()
      }

      recognition.onend = () => {
        recognitionRef.current = null
        if (!shouldContinueRecognitionRef.current) {
          const pendingInterim = lastInterimRef.current.trim()
          if (pendingInterim) {
            onTranscript(pendingInterim)
          }
          setInterimText('')
          lastInterimRef.current = ''
          setState('idle')
          return
        }

        // Chrome mobile may auto-end on silence even with continuous mode.
        // Restart quickly so pause -> resume continues in one recording session.
        if (restartCountRef.current < 30) {
          restartCountRef.current += 1
          window.setTimeout(() => {
            if (shouldContinueRecognitionRef.current) {
              startSession()
            }
          }, 120)
        } else {
          shouldContinueRecognitionRef.current = false
          setState('idle')
        }
      }

      recognitionRef.current = recognition
      try {
        recognition.start()
      } catch {
        recognitionRef.current = null
        if (!usingMediaFallbackRef.current) {
          usingMediaFallbackRef.current = true
          startMediaRecorderRef.current()
          return
        }
        setError(language === 'id'
          ? 'Gagal memulai perekaman suara.'
          : 'Could not start voice recording.')
        setState('idle')
      }
    }
    startSession()
    setState('recording')

    timeoutRef.current = setTimeout(() => {
      stopRecording()
    }, MAX_RECORDING_MS)
  }, [language, onTranscript, cleanup])

  const startMediaRecorder = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4',
      })

      chunksRef.current = []

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data)
        }
      }

      mediaRecorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: mediaRecorder.mimeType })
        streamRef.current?.getTracks().forEach(t => t.stop())
        streamRef.current = null

        if (blob.size === 0) {
          setState('idle')
          return
        }

        setState('transcribing')
        try {
          const formData = new FormData()
          formData.append('audio', blob, 'recording.webm')
          formData.append('language', language)

          const response = await fetch(
            `${supabaseUrl}/functions/v1/transcribe-audio`,
            {
              method: 'POST',
              headers: edgeFunctionAnonFormHeaders(),
              body: formData,
            }
          )

          if (!response.ok) {
            throw new Error('Transcription failed')
          }

          const data = await response.json()
          if (data.text) {
            onTranscript(data.text)
          }
        } catch {
          setError(language === 'id'
            ? 'Transkripsi gagal. Silakan ketik jawaban Anda.'
            : 'Transcription failed. Please type your answer.')
        }
        setState('idle')
      }

      mediaRecorderRef.current = mediaRecorder
      mediaRecorder.start(1000)
      setState('recording')

      timeoutRef.current = setTimeout(() => {
        stopRecording()
      }, MAX_RECORDING_MS)
    } catch {
      setError(language === 'id'
        ? 'Tidak dapat mengakses mikrofon.'
        : 'Could not access microphone.')
      setState('idle')
    }
  }, [language, supabaseUrl, onTranscript])
  startMediaRecorderRef.current = () => {
    void startMediaRecorder()
  }

  const startRecording = useCallback(() => {
    if (state !== 'idle' || startingRef.current) return
    startingRef.current = true
    usingMediaFallbackRef.current = false
    setError(null)
    try {
      if (useNativeSpeech) {
        startNativeSpeech()
      } else {
        void startMediaRecorder()
      }
    } finally {
      window.setTimeout(() => {
        startingRef.current = false
      }, 250)
    }
  }, [state, useNativeSpeech, startNativeSpeech, startMediaRecorder])

  const stopRecording = useCallback(() => {
    shouldContinueRecognitionRef.current = false
    startingRef.current = false
    usingMediaFallbackRef.current = false
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
    if (recognitionRef.current) {
      try { recognitionRef.current.stop() } catch { /* ignore */ }
      recognitionRef.current = null
      setState('idle')
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
      // State will be set in onstop handler
    }
  }, [])

  const cancelRecording = useCallback(() => {
    shouldContinueRecognitionRef.current = false
    startingRef.current = false
    usingMediaFallbackRef.current = false
    cleanup()
    setState('idle')
  }, [cleanup])

  const dismissError = useCallback(() => {
    setError(null)
  }, [])

  return {
    state,
    interimText,
    error,
    isSupported: useNativeSpeech || hasMediaRecorderSupport,
    startRecording,
    stopRecording,
    cancelRecording,
    dismissError,
  }
}
