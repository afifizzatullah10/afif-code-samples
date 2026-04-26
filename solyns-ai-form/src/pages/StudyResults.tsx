import { useCallback, useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { ResponsesSpreadsheet } from '@/components/form/ResponsesSpreadsheet'
import { SmartInsightsTab } from '@/components/form/SmartInsightsTab'
import { AnalyticsInsightsTab } from '@/components/form/AnalyticsInsightsTab'
import { QuestionSummaryCards } from '@/components/form/QuestionSummaryCards'
import {
  fetchForm,
  fetchResponses,
  fetchInsights,
  generateInsights,
  updateFormStatus,
  deleteForm,
} from '@/lib/api'
import type { Form, Response, StudyInsight, InsightTheme, InsightRecommendation } from '@/lib/types'
import {
  Loader2,
  Copy,
  Check,
  Sparkles,
  Pause,
  Play,
  CheckCircle2,
  Trash2,
  AlertCircle,
} from 'lucide-react'

export default function StudyResults() {
  const { id } = useParams()
  const navigate = useNavigate()

  const [form, setForm] = useState<Form | null>(null)
  const [responses, setResponses] = useState<Response[]>([])
  const [insights, setInsights] = useState<StudyInsight[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [generatingInsights, setGeneratingInsights] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)

  const hasStoredInsights = insights.length > 0

  const refreshForm = useCallback(() => {
    if (!id) return
    void fetchForm(id)
      .then(f => setForm(f))
      .catch(err => setError(err.message))
  }, [id])

  useEffect(() => {
    if (!id) return
    Promise.all([fetchForm(id), fetchResponses(id), fetchInsights(id)])
      .then(([f, r, i]) => {
        setForm(f)
        setResponses(r)
        setInsights(i)
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [id])

  /**
   * New partial responses may be written while this tab is in the background.
   * Refetch on focus / visibility change and also poll every 10s while the tab
   * is visible so newly-saved rows show up without a manual refresh.
   */
  useEffect(() => {
    if (!id) return
    let cancelled = false
    const refreshResponses = () => {
      void fetchResponses(id)
        .then(r => {
          if (!cancelled) setResponses(r)
        })
        .catch(() => {})
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible') refreshResponses()
    }

    window.addEventListener('focus', refreshResponses)
    document.addEventListener('visibilitychange', onVisible)

    const poll = window.setInterval(() => {
      if (document.visibilityState === 'visible') refreshResponses()
    }, 10000)

    return () => {
      cancelled = true
      clearInterval(poll)
      window.removeEventListener('focus', refreshResponses)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [id])

  useEffect(() => {
    if (!id) return
    const onTitle = (e: Event) => {
      const d = (e as CustomEvent<{ id: string; title: string }>).detail
      if (d?.id === id) setForm(prev => (prev ? { ...prev, title: d.title } : prev))
    }
    const onFormUpdated = (e: Event) => {
      const d = (e as CustomEvent<{ id: string }>).detail
      if (d?.id === id) refreshForm()
    }
    window.addEventListener('solyns:form-title', onTitle)
    window.addEventListener('solyns:form-updated', onFormUpdated)
    return () => {
      window.removeEventListener('solyns:form-title', onTitle)
      window.removeEventListener('solyns:form-updated', onFormUpdated)
    }
  }, [id, refreshForm])

  const shareUrl = form?.share_slug ? `${window.location.origin}/s/${form.share_slug}` : ''

  const handleCopy = () => {
    navigator.clipboard.writeText(shareUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleGenerateInsights = async () => {
    if (!id) return
    setGeneratingInsights(true)
    try {
      await generateInsights(id)
      const updated = await fetchInsights(id)
      setInsights(updated)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate insights')
    } finally {
      setGeneratingInsights(false)
    }
  }

  const handleStatusChange = async (newStatus: Form['status']) => {
    if (!id) return
    setActionLoading(true)
    try {
      const updated = await updateFormStatus(id, newStatus)
      setForm(updated)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update status')
    } finally {
      setActionLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!id || !confirm('Delete this form and all responses? This cannot be undone.')) return
    setActionLoading(true)
    try {
      await deleteForm(id)
      navigate('/dashboard')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete')
      setActionLoading(false)
    }
  }

  const themes: InsightTheme[] =
    insights.find(i => i.insight_type === 'themes')?.content?.themes ?? []
  const executiveSummary: string =
    insights.find(i => i.insight_type === 'summary')?.content?.executive_summary ?? ''
  const recommendations: InsightRecommendation[] =
    insights.find(i => i.insight_type === 'recommendations')?.content?.recommendations ?? []
  const insightResponseCount = insights[0]?.response_count ?? 0

  const insightSourceResponses = responses.filter(r => {
    const t = r.transcript
    if (!Array.isArray(t) || t.length === 0) return false
    return (
      r.status === 'completed' ||
      r.status === 'in_progress' ||
      (r.status === 'abandoned' && t.length > 0)
    )
  })

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error && !form) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      </div>
    )
  }

  if (!form) return null

  const statusColors: Record<string, string> = {
    draft: 'bg-yellow-100 text-yellow-800',
    active: 'bg-green-100 text-green-800',
    paused: 'bg-orange-100 text-orange-800',
    completed: 'bg-blue-100 text-blue-800',
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="container max-w-5xl py-8 [&:has([data-results-wide])]:max-w-[min(100%,88rem)]">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight sm:text-2xl">{form.title}</h1>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${statusColors[form.status] ?? ''}`}
              >
                {form.status}
              </span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{form.objective}</p>
          </div>
          {shareUrl && form.status === 'active' && (
            <div className="flex flex-wrap items-center gap-2">
              <input readOnly value={shareUrl} className="h-8 min-w-[12rem] flex-1 rounded-md border bg-muted/50 px-2 text-xs" />
              <Button size="sm" variant="outline" onClick={handleCopy}>
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              </Button>
            </div>
          )}
        </div>

        {error && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
            <button type="button" onClick={() => setError(null)} className="ml-auto text-xs underline">
              Dismiss
            </button>
          </div>
        )}

        <Tabs defaultValue="smart-insights">
          <TabsList className="mb-4 flex h-auto w-full flex-wrap justify-start gap-0 rounded-none border-b bg-transparent p-0">
            <TabsTrigger
              value="smart-insights"
              className="rounded-none border-b-2 border-transparent px-3 py-2 text-sm data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none"
            >
              <span className="inline-flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5" />
                Smart insights
              </span>
            </TabsTrigger>
            <TabsTrigger
              value="insights"
              className="rounded-none border-b-2 border-transparent px-3 py-2 text-sm data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none"
            >
              Insights
            </TabsTrigger>
            <TabsTrigger
              value="summary"
              className="rounded-none border-b-2 border-transparent px-3 py-2 text-sm data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none"
            >
              Summary
            </TabsTrigger>
            <TabsTrigger
              value="responses"
              className="rounded-none border-b-2 border-transparent px-3 py-2 text-sm data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none"
            >
              Responses ({responses.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="smart-insights" className="mt-0">
            <SmartInsightsTab
              form={form}
              sourceResponseCount={insightSourceResponses.length}
              generatingInsights={generatingInsights}
              hasStoredInsights={hasStoredInsights}
              executiveSummary={executiveSummary}
              themes={themes}
              recommendations={recommendations}
              insightResponseCount={insightResponseCount}
              onGenerate={handleGenerateInsights}
            />
          </TabsContent>

          <TabsContent value="insights" className="mt-0">
            <AnalyticsInsightsTab form={form} responses={responses} />
          </TabsContent>

          <TabsContent value="summary" className="mt-0">
            <QuestionSummaryCards form={form} responses={responses} />
          </TabsContent>

          <TabsContent value="responses" className="mt-0 space-y-3" data-results-wide>
            <ResponsesSpreadsheet
              form={form}
              responses={responses}
              onResponseSummarySaved={(responseId, summary) =>
                setResponses(prev =>
                  prev.map(r => (r.id === responseId ? { ...r, ai_summary: summary } : r))
                )
              }
            />
          </TabsContent>
        </Tabs>

        <Card className="mt-10">
          <CardHeader>
            <CardTitle className="text-base">AI Form status</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {form.status === 'draft' && (
              <Button size="sm" onClick={() => handleStatusChange('active')} disabled={actionLoading}>
                <Play className="mr-1 h-3.5 w-3.5" /> Go live
              </Button>
            )}
            {form.status === 'active' && (
              <Button size="sm" variant="outline" onClick={() => handleStatusChange('paused')} disabled={actionLoading}>
                <Pause className="mr-1 h-3.5 w-3.5" /> Pause
              </Button>
            )}
            {form.status === 'paused' && (
              <Button size="sm" onClick={() => handleStatusChange('active')} disabled={actionLoading}>
                <Play className="mr-1 h-3.5 w-3.5" /> Resume
              </Button>
            )}
            {(form.status === 'active' || form.status === 'paused') && (
              <Button size="sm" variant="outline" onClick={() => handleStatusChange('completed')} disabled={actionLoading}>
                <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Mark complete
              </Button>
            )}
          </CardContent>
        </Card>

        <Card className="mt-4 border-destructive/50">
          <CardHeader>
            <CardTitle className="text-base text-destructive">Danger zone</CardTitle>
          </CardHeader>
          <CardContent>
            <Button variant="destructive" size="sm" onClick={handleDelete} disabled={actionLoading}>
              <Trash2 className="mr-1 h-3.5 w-3.5" /> Delete AI form
            </Button>
            <p className="mt-2 text-xs text-muted-foreground">Permanently deletes this AI form and all responses.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
