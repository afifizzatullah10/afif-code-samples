import { useEffect, useState, useMemo } from 'react'
import { useParams, useMatch } from 'react-router-dom'
import { fetchForm, fetchFormBySlug } from '@/lib/api'
import { useFormFlow } from '@/hooks/useFormFlow'
import { ProgressBar } from '@/components/form/ProgressBar'
import { WelcomeScreen } from '@/components/form/WelcomeScreen'
import { ThankYouScreen } from '@/components/form/ThankYouScreen'
import { QuestionCard } from '@/components/form/QuestionCard'
import { RespondentFooter } from '@/components/form/RespondentFooter'
import { Button } from '@/components/ui/button'
import type { Form } from '@/lib/types'
import { Loader2, AlertCircle, MessageSquare } from 'lucide-react'

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

export default function RespondentForm() {
  const { shareSlug } = useParams()
  const previewMatch = useMatch({ path: '/form/:id/preview', end: true })
  const previewFormId = previewMatch?.params?.id
  const isPreview = Boolean(previewFormId)

  const [form, setForm] = useState<Form | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const {
    status,
    questionIndex,
    totalQuestions,
    currentQuestion,
    displayQuestion,
    isFollowUp,
    progress,
    error: formError,
    prefillMainAnswer,
    navigationEpoch,
    canGoBack,
    canGoForward,
    startForm,
    submitAnswer,
    goBack,
    goForward,
    retry,
  } = useFormFlow(form, { preview: isPreview })

  useEffect(() => {
    if (isPreview && previewFormId) {
      setLoading(true)
      setLoadError(null)
      fetchForm(previewFormId)
        .then(setForm)
        .catch(() => setLoadError('Could not load this form.'))
        .finally(() => setLoading(false))
      return
    }
    if (!shareSlug) {
      setLoading(false)
      return
    }
    fetchFormBySlug(shareSlug)
      .then(setForm)
      .catch(() => setLoadError('This form is not available.'))
      .finally(() => setLoading(false))
  }, [shareSlug, isPreview, previewFormId])

  const isId = form?.language === 'id'
  const primaryColor = form?.branding?.primary_color
  const logoUrl = form?.branding?.logo_url
  const companyName = form?.branding?.company_name

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

  if (loadError || !form) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center bg-background px-6 text-center">
        <AlertCircle className="mb-4 h-12 w-12 text-muted-foreground" />
        <h1 className="text-lg font-semibold">{loadError || 'Form not found'}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {isPreview
            ? 'Check that you are signed in and the form exists.'
            : 'This link may be expired or invalid.'}
        </p>
      </div>
    )
  }

  return (
    <div className="flex h-dvh flex-col bg-background" style={brandStyle}>
      {isPreview && (
        <div className="shrink-0 border-b border-amber-200 bg-amber-50 px-4 py-1.5 text-center text-xs font-medium text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-50">
          {isId
            ? 'Pratinjau — jawaban tidak disimpan.'
            : 'Preview — answers are not saved. Use arrows to move between questions.'}
        </div>
      )}
      {/* Top bar */}
      {status !== 'welcome' && (
        <div className="shrink-0">
          <div className="flex items-center gap-2 px-4 py-2.5 sm:px-6">
            {logoUrl ? (
              <img src={logoUrl} alt="" className="h-7 w-7 rounded-full object-cover" />
            ) : (
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10">
                <MessageSquare className="h-3.5 w-3.5 text-primary" />
              </div>
            )}
            <p className="min-w-0 flex-1 truncate text-sm font-medium">
              {companyName || form.title}
            </p>
            {(status === 'answering' ||
              status === 'evaluating' ||
              status === 'transitioning') &&
              totalQuestions > 0 && (
              <span
                className="shrink-0 tabular-nums text-xs font-medium text-muted-foreground sm:text-sm"
                aria-live="polite"
                aria-label={
                  isId
                    ? `Pertanyaan ${questionIndex + 1} dari ${totalQuestions}`
                    : `Question ${questionIndex + 1} of ${totalQuestions}`
                }
              >
                {isId
                  ? `${questionIndex + 1} dari ${totalQuestions}`
                  : `${questionIndex + 1}/${totalQuestions}`}
              </span>
            )}
          </div>
          <ProgressBar progress={progress} />
        </div>
      )}

      {/* Welcome */}
      {status === 'welcome' && (
        <WelcomeScreen study={form} onStart={startForm} />
      )}

      {/* Question */}
      {(status === 'answering' || status === 'evaluating') &&
        currentQuestion &&
        displayQuestion && (
          <QuestionCard
            key={`${questionIndex}-${isFollowUp}`}
            question={currentQuestion}
            displayText={displayQuestion.text}
            displayDescription={displayQuestion.description}
            imageUrl={'imageUrl' in displayQuestion ? displayQuestion.imageUrl : undefined}
            questionNumber={questionIndex + 1}
            isFollowUp={isFollowUp}
            language={form.language as 'en' | 'id'}
            readAloudDefaultEnabled={form.branding?.ai_read_aloud_enabled ?? true}
            readAloudStorageScope={form.id}
            readAloudDisabled={isPreview}
            onSubmit={submitAnswer}
            isEvaluating={status === 'evaluating'}
            prefillMainAnswer={prefillMainAnswer}
            navigationEpoch={navigationEpoch}
          />
        )}

      {/* Transitioning */}
      {status === 'transitioning' && (
        <div className="flex flex-1 items-center justify-center">
          <div className="h-1 w-12 animate-pulse rounded-full bg-primary/30" />
        </div>
      )}

      {/* Complete */}
      {status === 'complete' && <ThankYouScreen study={form} />}

      {/* Error */}
      {status === 'error' && (
        <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
          <AlertCircle className="mb-4 h-12 w-12 text-destructive" />
          <h1 className="text-lg font-semibold">
            {isId ? 'Terjadi kesalahan' : 'Something went wrong'}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {formError ||
              (isId
                ? 'Jawaban Anda telah disimpan. Silakan coba lagi.'
                : 'Your answers have been saved. Please try again.')}
          </p>
          <Button className="mt-6" onClick={retry}>
            {isId ? 'Coba Lagi' : 'Try Again'}
          </Button>
        </div>
      )}

      <RespondentFooter
        language={form.language as 'en' | 'id'}
        showNav={status === 'answering' || status === 'evaluating'}
        canGoBack={canGoBack}
        canGoForward={canGoForward}
        onBack={goBack}
        onForward={goForward}
      />
    </div>
  )
}
