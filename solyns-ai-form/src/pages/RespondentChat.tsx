import { useEffect, useRef, useState, useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { fetchStudyBySlug } from '@/lib/api'
import { useConversation } from '@/hooks/useConversation'
import { ChatBubble } from '@/components/chat/ChatBubble'
import { ChatInput } from '@/components/chat/ChatInput'
import { TypingIndicator } from '@/components/chat/TypingIndicator'
import { ProgressDots } from '@/components/chat/ProgressDots'
import { Button } from '@/components/ui/button'
import type { Study } from '@/lib/types'
import { getWelcomeMessageBody } from '@/lib/welcomeMessage'
import { Loader2, MessageSquare, AlertCircle, ExternalLink } from 'lucide-react'

function hexToHslValues(hex: string): string | null {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  if (!m) return null
  const r = parseInt(m[1], 16) / 255
  const g = parseInt(m[2], 16) / 255
  const b = parseInt(m[3], 16) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return `0 0% ${Math.round(l * 100)}%`
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h = 0
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6
  else if (max === g) h = ((b - r) / d + 2) / 6
  else h = ((r - g) / d + 4) / 6
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`
}

export default function RespondentChat() {
  const { shareSlug } = useParams()
  const [study, setStudy] = useState<Study | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const chatEndRef = useRef<HTMLDivElement>(null)

  const {
    status,
    transcript,
    questionIndex,
    totalQuestions,
    error: conversationError,
    startConversation,
    sendMessage,
    dismissError,
  } = useConversation(study)

  useEffect(() => {
    if (!shareSlug) return
    fetchStudyBySlug(shareSlug)
      .then(setStudy)
      .catch(() => setLoadError('This study is not available.'))
      .finally(() => setLoading(false))
  }, [shareSlug])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [transcript, status])

  const isId = study?.language === 'id'
  const companyName = study?.branding?.company_name
  const logoUrl = study?.branding?.logo_url
  const welcomeImageUrl = study?.branding?.welcome_image_url?.trim()
  const primaryColor = study?.branding?.primary_color

  const brandStyle = useMemo(() => {
    if (!primaryColor) return undefined
    const hsl = hexToHslValues(primaryColor)
    if (!hsl) return undefined
    return {
      '--primary': hsl,
      '--ring': hsl,
    } as React.CSSProperties
  }, [primaryColor])

  if (loading) {
    return (
      <div className="flex h-dvh items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (loadError || !study) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center bg-background px-6 text-center">
        <AlertCircle className="mb-4 h-12 w-12 text-muted-foreground" />
        <h1 className="text-lg font-semibold">{loadError || 'Study not found'}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          This link may be expired or invalid.
        </p>
      </div>
    )
  }

  // --- Welcome screen ---
  if (status === 'welcome') {
    return (
      <div className="flex h-dvh flex-col bg-background" style={brandStyle}>
        <TopBar companyName={companyName} title={study.title} logoUrl={logoUrl} />
        <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
          {logoUrl ? (
            <img src={logoUrl} alt={companyName || ''} className="mb-6 h-16 w-16 rounded-full object-cover" />
          ) : (
            <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
              <MessageSquare className="h-8 w-8 text-primary" />
            </div>
          )}
          {welcomeImageUrl && (
            <img
              src={welcomeImageUrl}
              alt=""
              className="mb-5 max-h-48 w-full max-w-md rounded-xl border border-border object-cover shadow-sm"
            />
          )}
          <h1 className="mb-3 text-xl font-bold tracking-tight sm:text-2xl">
            {study.title}
          </h1>
          <p className="mb-8 max-w-md text-sm leading-relaxed text-muted-foreground whitespace-pre-line">
            {getWelcomeMessageBody(study)}
          </p>
          <Button size="lg" onClick={startConversation} className="px-8">
            {isId ? 'Mulai Percakapan' : 'Start Conversation'}
          </Button>
          <p className="mt-4 text-xs text-muted-foreground">
            {isId
              ? `Sekitar ${study.discussion_guide?.estimated_duration_minutes ?? 5} menit`
              : `About ${study.discussion_guide?.estimated_duration_minutes ?? 5} minutes`}
          </p>
        </div>
      </div>
    )
  }

  // --- Thank-you screen ---
  if (status === 'complete') {
    return (
      <div className="flex h-dvh flex-col bg-background" style={brandStyle}>
        <TopBar companyName={companyName} title={study.title} logoUrl={logoUrl} />
        <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
          <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
            <svg className="h-8 w-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="mb-3 text-xl font-bold tracking-tight">
            {study.thank_you_message || (isId ? 'Terima kasih!' : 'Thank you!')}
          </h1>
          <p className="max-w-md text-sm text-muted-foreground">
            {isId
              ? 'Jawaban Anda telah direkam. Terima kasih atas waktu Anda!'
              : 'Your responses have been recorded. We appreciate your time!'}
          </p>
          {study.redirect_url && (
            <Button variant="outline" className="mt-6" asChild>
              <a href={study.redirect_url}>
                <ExternalLink className="mr-2 h-4 w-4" />
                {isId ? 'Lanjutkan' : 'Continue'}
              </a>
            </Button>
          )}
        </div>
      </div>
    )
  }

  // --- Error state ---
  if (status === 'error') {
    return (
      <div className="flex h-dvh flex-col items-center justify-center bg-background px-6 text-center" style={brandStyle}>
        <AlertCircle className="mb-4 h-12 w-12 text-destructive" />
        <h1 className="text-lg font-semibold">
          {isId ? 'Terjadi kesalahan' : 'Something went wrong'}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {isId
            ? 'Jawaban Anda telah disimpan. Silakan coba lagi.'
            : 'Your answers have been saved. Please try again.'}
        </p>
        <Button className="mt-6" onClick={startConversation}>
          {isId ? 'Coba Lagi' : 'Try Again'}
        </Button>
      </div>
    )
  }

  // --- Chat screen ---
  return (
    <div className="flex h-dvh flex-col bg-background" style={brandStyle}>
      <TopBar companyName={companyName} title={study.title} logoUrl={logoUrl} />

      <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6">
        <div className="mx-auto flex max-w-lg flex-col gap-3">
          {transcript.map((msg, i) => (
            <ChatBubble
              key={i}
              role={msg.role}
              content={msg.content}
              audioBase64={msg.audio_base64}
              isNew={i >= transcript.length - 2}
            />
          ))}

          {status === 'typing' && <TypingIndicator />}

          {conversationError && (
            <div className="flex justify-center">
              <button
                onClick={dismissError}
                className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive"
              >
                {conversationError} (tap to dismiss)
              </button>
            </div>
          )}

          <div ref={chatEndRef} />
        </div>
      </div>

      <div className="mx-auto w-full max-w-lg safe-bottom">
        {totalQuestions > 0 && (
          <ProgressDots total={totalQuestions} current={questionIndex} />
        )}
        <ChatInput
          onSend={sendMessage}
          disabled={status !== 'chatting'}
          placeholder={isId ? 'Ketik jawaban Anda...' : 'Type your answer...'}
          language={study.language as 'en' | 'id'}
        />
      </div>
    </div>
  )
}

function TopBar({ companyName, title, logoUrl }: { companyName?: string; title: string; logoUrl?: string }) {
  return (
    <div className="flex items-center gap-2 border-b px-4 py-2.5 sm:px-6">
      {logoUrl ? (
        <img src={logoUrl} alt="" className="h-7 w-7 rounded-full object-cover" />
      ) : (
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10">
          <MessageSquare className="h-3.5 w-3.5 text-primary" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {companyName || title}
        </p>
      </div>
    </div>
  )
}
