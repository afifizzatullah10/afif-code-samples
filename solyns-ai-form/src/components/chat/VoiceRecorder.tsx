import { Mic, Square, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface VoiceRecorderProps {
  state: 'idle' | 'recording' | 'transcribing'
  onStart: () => void
  onStop: () => void
  onCancel: () => void
  disabled?: boolean
}

export function VoiceRecorder({ state, onStart, onStop, onCancel, disabled }: VoiceRecorderProps) {
  if (state === 'transcribing') {
    return (
      <button
        disabled
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"
      >
        <Loader2 className="h-4 w-4 animate-spin" />
      </button>
    )
  }

  if (state === 'recording') {
    return (
      <div className="flex items-center gap-1.5">
        <button
          onClick={onCancel}
          className="flex h-8 items-center rounded-full bg-muted px-2.5 text-xs text-muted-foreground hover:bg-muted/80 transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={onStop}
          className={cn(
            'relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-destructive text-destructive-foreground transition-transform hover:scale-105',
          )}
        >
          <span className="absolute inset-0 animate-ping rounded-full bg-destructive/30" />
          <Square className="relative h-4 w-4" />
        </button>
      </div>
    )
  }

  return (
    <button
      onClick={onStart}
      disabled={disabled}
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors hover:bg-primary hover:text-primary-foreground disabled:opacity-40"
    >
      <Mic className="h-4 w-4" />
    </button>
  )
}
