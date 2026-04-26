import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

interface ChatBubbleProps {
  role: 'ai' | 'user'
  content: string
  audioBase64?: string
  isNew?: boolean
  /** Shown above AI bubble content (e.g. follow-up indicator) */
  label?: string | null
}

function toAudioDataUrl(base64: string): string {
  if (/^data:audio\//i.test(base64)) return base64
  return `data:audio/mpeg;base64,${base64}`
}

export function ChatBubble({ role, content, audioBase64, isNew = false, label }: ChatBubbleProps) {
  const isAi = role === 'ai'
  const [visibleText, setVisibleText] = useState(content)
  const [isSyncPlaying, setIsSyncPlaying] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const typingIntervalRef = useRef<number | null>(null)

  const shouldSync = isAi && isNew && !!audioBase64 && content.length > 0

  const stopSync = useCallback((revealAll: boolean) => {
    if (typingIntervalRef.current !== null) {
      window.clearInterval(typingIntervalRef.current)
      typingIntervalRef.current = null
    }
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
      audioRef.current.src = ''
      audioRef.current = null
    }
    if (revealAll) setVisibleText(content)
    setIsSyncPlaying(false)
  }, [content])

  useEffect(() => {
    setVisibleText(content)
  }, [content])

  useEffect(() => {
    if (!shouldSync || !audioBase64) {
      setIsSyncPlaying(false)
      return
    }

    stopSync(false)
    setVisibleText('')

    const audio = new Audio(toAudioDataUrl(audioBase64))
    audioRef.current = audio

    const startSynchronizedPlayback = () => {
      const durationMs = Math.max(1, (audio.duration || 0) * 1000)
      const msPerChar = durationMs / Math.max(content.length, 1)
      let index = 0

      setIsSyncPlaying(true)
      void audio.play().catch(() => {
        stopSync(true)
      })

      typingIntervalRef.current = window.setInterval(() => {
        index += 1
        if (index >= content.length) {
          setVisibleText(content)
          stopSync(false)
          return
        }
        setVisibleText(content.slice(0, index))
      }, msPerChar)
    }

    audio.addEventListener('loadedmetadata', startSynchronizedPlayback, { once: true })
    audio.load()

    return () => {
      audio.removeEventListener('loadedmetadata', startSynchronizedPlayback)
      stopSync(false)
    }
  }, [audioBase64, content, shouldSync, stopSync])

  const syncControls = useMemo(() => {
    if (!isSyncPlaying) return null
    return (
      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={() => stopSync(true)}
          className="rounded-md border border-border/70 px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted"
        >
          Skip
        </button>
        <button
          type="button"
          onClick={() => stopSync(true)}
          className="rounded-md border border-border/70 px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted"
        >
          Stop
        </button>
      </div>
    )
  }, [isSyncPlaying, stopSync])

  return (
    <div
      className={cn(
        'flex w-full',
        isAi ? 'justify-start' : 'justify-end',
        isNew && 'animate-in fade-in slide-in-from-bottom-2 duration-300'
      )}
    >
      <div
        className={cn(
          'max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed sm:max-w-[75%]',
          isAi
            ? 'rounded-bl-md bg-muted text-foreground'
            : 'rounded-br-md bg-primary text-primary-foreground'
        )}
      >
        {isAi && label && (
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-primary">{label}</p>
        )}
        {visibleText}
        {syncControls}
      </div>
    </div>
  )
}
