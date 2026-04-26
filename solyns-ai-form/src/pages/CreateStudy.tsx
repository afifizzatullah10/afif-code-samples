import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Header } from '@/components/layout/Header'
import { Button } from '@/components/ui/button'
import { generateDiscussionGuide } from '@/lib/api'
import { generateGuideSchema } from '@/lib/validation'
import { Sparkles, ArrowLeft, Loader2 } from 'lucide-react'

export default function CreateStudy() {
  const navigate = useNavigate()

  const [objective, setObjective] = useState('')
  const [language, setLanguage] = useState<'en' | 'id'>('en')
  const [companyName, setCompanyName] = useState('')
  const [additionalContext, setAdditionalContext] = useState('')
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleGenerate = async () => {
    setError(null)

    const parsed = generateGuideSchema.safeParse({
      objective,
      language,
      company_name: companyName || undefined,
      additional_context: additionalContext || undefined,
    })

    if (!parsed.success) {
      setError(parsed.error.errors[0]?.message || 'Invalid input')
      return
    }

    setGenerating(true)
    try {
      const guide = await generateDiscussionGuide(parsed.data)

      const title = objective.length > 60 ? objective.slice(0, 60) + '...' : objective

      const isId = language === 'id'
      const welcome = isId
        ? `Halo! Terima kasih sudah meluangkan waktu untuk berbagi pendapat Anda${companyName ? ` tentang ${companyName}` : ''}. Ini hanya akan memakan waktu sekitar ${guide.estimated_duration_minutes ?? 5} menit.`
        : `Hi! Thank you for taking a few minutes to share your thoughts${companyName ? ` about ${companyName}` : ''}. This will only take about ${guide.estimated_duration_minutes ?? 5} minutes.`

      // Navigate to builder with the generated guide
      const params = new URLSearchParams({
        guide: encodeURIComponent(JSON.stringify(guide)),
        title,
        objective,
        language,
        company: companyName,
        welcome,
      })
      navigate(`/form/new/build?${params.toString()}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate. Please try again.')
    } finally {
      setGenerating(false)
    }
  }

  const handleStartFromScratch = () => {
    navigate('/form/new/build')
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center px-6">
        <div className="w-full max-w-xl text-center">
          <p className="mb-2 text-sm font-medium text-primary">Solyns AI Form</p>
          <h1 className="mb-8 text-2xl font-bold tracking-tight sm:text-3xl">
            What would you like to learn?
          </h1>

          <div className="space-y-4 text-left">
            <div className="rounded-xl border bg-background p-5 shadow-sm">
              <textarea
                value={objective}
                onChange={e => setObjective(e.target.value)}
                rows={3}
                placeholder="Explain the goal of your AI form..."
                className="w-full resize-none border-none bg-transparent text-sm placeholder:text-muted-foreground focus:outline-none"
              />
              <div className="mt-3 flex items-center gap-2 border-t pt-3">
                <div className="flex gap-1.5">
                  <select
                    value={language}
                    onChange={e => setLanguage(e.target.value as 'en' | 'id')}
                    className="rounded-md border border-input bg-transparent px-2 py-1 text-xs"
                  >
                    <option value="en">English</option>
                    <option value="id">Bahasa Indonesia</option>
                  </select>
                  <input
                    value={companyName}
                    onChange={e => setCompanyName(e.target.value)}
                    placeholder="Company name"
                    className="rounded-md border border-input bg-transparent px-2 py-1 text-xs placeholder:text-muted-foreground"
                  />
                </div>
              </div>
            </div>

            <details className="text-sm">
              <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                Additional context (optional)
              </summary>
              <textarea
                value={additionalContext}
                onChange={e => setAdditionalContext(e.target.value)}
                rows={2}
                placeholder="Audience, industry, constraints, or tone — anything that helps tailor your form"
                className="mt-2 w-full resize-none rounded-md border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </details>

            {error && (
              <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}

            <div className="flex flex-col items-center gap-3 pt-2">
              <Button
                type="button"
                onClick={handleGenerate}
                disabled={objective.trim().length < 10 || generating}
                className="w-full sm:w-auto"
                size="lg"
              >
                {generating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Generating your AI form...
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-4 w-4" />
                    Generate with AI
                  </>
                )}
              </Button>

              <button
                onClick={handleStartFromScratch}
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                Start from scratch
              </button>
            </div>
          </div>

          <button
            onClick={() => navigate('/dashboard')}
            className="mt-8 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mx-auto"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to dashboard
          </button>
        </div>
      </main>
    </div>
  )
}
