import { useState, useRef, useEffect } from 'react'
import { SendHorizontal } from 'lucide-react'
import { VoiceRecorder } from './VoiceRecorder'
import { useVoiceInput } from '@/hooks/useVoiceInput'

interface ChatInputProps {
  onSend: (message: string) => void
  disabled?: boolean
  placeholder?: string
  language?: 'en' | 'id'
}

export function ChatInput({
  onSend,
  disabled = false,
  placeholder = 'Type your answer...',
  language = 'en',
}: ChatInputProps) {
  const [value, setValue] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const voice = useVoiceInput({
    language,
    supabaseUrl: import.meta.env.VITE_SUPABASE_URL ?? '',
    onTranscript: (text) => {
      setValue(prev => (prev ? prev + ' ' + text : text))
    },
  })

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + 'px'
    }
  }, [value])

  // Show interim text in placeholder while recording
  const displayPlaceholder = voice.state === 'recording' && voice.interimText
    ? voice.interimText
    : voice.state === 'recording'
      ? (language === 'id' ? 'Mendengarkan...' : 'Listening...')
      : voice.state === 'transcribing'
        ? (language === 'id' ? 'Mentranskripsikan...' : 'Transcribing...')
        : placeholder

  const handleSend = () => {
    const trimmed = value.trim()
    if (!trimmed || disabled) return
    onSend(trimmed)
    setValue('')
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const isVoiceBusy = voice.state === 'recording' || voice.state === 'transcribing'

  return (
    <div>
      {voice.error && (
        <div className="px-3 pb-1 sm:px-4">
          <button
            onClick={voice.dismissError}
            className="w-full rounded-lg bg-destructive/10 px-3 py-1.5 text-xs text-destructive text-left"
          >
            {voice.error} (tap to dismiss)
          </button>
        </div>
      )}
      <div className="flex items-end gap-2 border-t bg-background p-3 sm:p-4">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={displayPlaceholder}
          disabled={disabled || isVoiceBusy}
          rows={1}
          className="flex-1 resize-none rounded-xl border border-input bg-muted/50 px-4 py-2.5 text-sm leading-relaxed placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
        />
        {voice.isSupported && (
          <VoiceRecorder
            state={voice.state}
            onStart={voice.startRecording}
            onStop={voice.stopRecording}
            onCancel={voice.cancelRecording}
            disabled={disabled}
          />
        )}
        <button
          onClick={handleSend}
          disabled={disabled || !value.trim() || isVoiceBusy}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          <SendHorizontal className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
