import { Fragment, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { TranscriptView } from '@/components/study/TranscriptView'
import { generateResponseSummary } from '@/lib/api'
import type { Form, QuestionType, Response } from '@/lib/types'
import {
  buildExportRows,
  blocksToRowCells,
  downloadResponsesCsv,
  downloadResponsesXlsx,
  formatResponseTime,
  parseTranscriptToBlocks,
  sanitizeFilename,
} from '@/lib/responseSpreadsheet'
import {
  ChevronDown,
  ChevronRight,
  Clock,
  Download,
  FileSpreadsheet,
  Hash,
  ListChecks,
  MessageSquare,
  Search,
  Star,
  ToggleLeft,
} from 'lucide-react'

function questionIcon(type: QuestionType) {
  switch (type) {
    case 'rating':
    case 'opinion_scale':
    case 'nps':
      return Star
    case 'multiple_choice':
    case 'dropdown':
      return ListChecks
    case 'yes_no':
    case 'legal':
      return ToggleLeft
    case 'short_text':
    case 'long_text':
    case 'email':
    case 'url':
    case 'phone':
    case 'date':
      return MessageSquare
    case 'number':
      return Hash
    case 'statement':
    default:
      return MessageSquare
  }
}

interface ResponsesSpreadsheetProps {
  form: Form
  responses: Response[]
  /** Updates local response row after AI summary is saved (avoids full refetch). */
  onResponseSummarySaved?: (responseId: string, summary: string) => void
}

export function ResponsesSpreadsheet({
  form,
  responses,
  onResponseSummarySaved,
}: ResponsesSpreadsheetProps) {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | Response['status']>('all')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [summaryGenId, setSummaryGenId] = useState<string | null>(null)
  const [summaryErrById, setSummaryErrById] = useState<Record<string, string | undefined>>({})

  const tableScrollRef = useRef<HTMLDivElement>(null)
  const topScrollRef = useRef<HTMLDivElement>(null)
  const [tableScrollWidth, setTableScrollWidth] = useState(0)
  const syncScrollLock = useRef(false)

  const questions = form.discussion_guide?.questions ?? []
  const exportColumns = useMemo(
    () => questions.map(q => ({ id: q.id, header: q.text })),
    [questions]
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return responses.filter(r => {
      if (statusFilter !== 'all' && r.status !== statusFilter) return false
      if (!q) return true
      const blocks = parseTranscriptToBlocks(r.transcript ?? [], questions)
      const cells = blocksToRowCells(blocks, questions)
      const hay = [
        r.id,
        r.respondent_name ?? '',
        r.status,
        formatResponseTime(r),
        ...exportColumns.map(c => cells.get(c.id) ?? ''),
      ]
        .join(' ')
        .toLowerCase()
      return hay.includes(q)
    })
  }, [responses, search, statusFilter, questions, exportColumns])

  const baseName = sanitizeFilename(form.title)

  const handleExportCsv = () => {
    const rows = buildExportRows(form, filtered, exportColumns)
    downloadResponsesCsv(`${baseName}-responses`, rows)
  }

  const handleExportXlsx = async () => {
    const rows = buildExportRows(form, filtered, exportColumns)
    await downloadResponsesXlsx(`${baseName}-responses`, rows)
  }

  useLayoutEffect(() => {
    const el = tableScrollRef.current
    if (!el) return
    const measure = () => setTableScrollWidth(el.scrollWidth)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [filtered.length, questions.length, expandedId])

  const syncTopFromTable = () => {
    const top = topScrollRef.current
    const table = tableScrollRef.current
    if (!top || !table || syncScrollLock.current) return
    if (Math.abs(top.scrollLeft - table.scrollLeft) < 1) return
    syncScrollLock.current = true
    top.scrollLeft = table.scrollLeft
    requestAnimationFrame(() => {
      syncScrollLock.current = false
    })
  }

  const syncTableFromTop = () => {
    const top = topScrollRef.current
    const table = tableScrollRef.current
    if (!top || !table || syncScrollLock.current) return
    if (Math.abs(top.scrollLeft - table.scrollLeft) < 1) return
    syncScrollLock.current = true
    table.scrollLeft = top.scrollLeft
    requestAnimationFrame(() => {
      syncScrollLock.current = false
    })
  }

  const handleGenerateSummary = async (responseId: string) => {
    setSummaryGenId(responseId)
    setSummaryErrById(prev => ({ ...prev, [responseId]: undefined }))
    try {
      const { summary } = await generateResponseSummary(responseId)
      onResponseSummarySaved?.(responseId, summary)
    } catch (e) {
      setSummaryErrById(prev => ({
        ...prev,
        [responseId]: e instanceof Error ? e.message : 'Could not generate summary',
      }))
    } finally {
      setSummaryGenId(null)
    }
  }

  if (responses.length === 0) {
    return (
      <div className="rounded-xl border border-dashed bg-muted/20 py-16 text-center text-sm text-muted-foreground">
        No responses yet. Share your form to collect answers.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="relative min-w-[12rem] flex-1 sm:max-w-sm">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            placeholder="Search responses"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="h-9 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm shadow-sm outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as typeof statusFilter)}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Filter by response status"
          >
            <option value="all">All statuses</option>
            <option value="completed">Completed</option>
            <option value="in_progress">In progress</option>
            <option value="abandoned">Abandoned</option>
          </select>
          <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={handleExportCsv}>
            <Download className="h-3.5 w-3.5" />
            CSV
          </Button>
          <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => void handleExportXlsx()}>
            <FileSpreadsheet className="h-3.5 w-3.5" />
            Excel
          </Button>
        </div>
      </div>

      {questions.length === 0 && (
        <p className="text-xs text-muted-foreground">
          Add questions in Content to show one column per question. You can still open each row for the full transcript.
        </p>
      )}

      <div className="overflow-hidden rounded-lg border bg-card shadow-sm">
        {/* Top horizontal scrollbar — synced with table scroll below */}
        <div
          ref={topScrollRef}
          className="overflow-x-auto overflow-y-hidden border-b border-border/60 bg-muted/25"
          onScroll={syncTableFromTop}
        >
          <div
            className="h-3 min-w-[720px] shrink-0"
            style={tableScrollWidth > 0 ? { width: tableScrollWidth } : undefined}
            aria-hidden
          />
        </div>
        <div
          ref={tableScrollRef}
          className="overflow-x-auto"
          onScroll={syncTopFromTable}
        >
          <table className="w-full min-w-[720px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b bg-muted/40">
              <th className="sticky left-0 z-10 w-10 border-r bg-muted/40 px-2 py-3" aria-label="Expand" />
              <th className="whitespace-nowrap px-3 py-3 font-medium text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" />
                  Response time
                </span>
              </th>
              <th className="whitespace-nowrap px-3 py-3 font-medium text-muted-foreground">Response type</th>
              {questions.map(q => {
                const Icon = questionIcon(q.type)
                return (
                  <th key={q.id} className="min-w-[10rem] max-w-[14rem] px-3 py-3 font-medium text-muted-foreground">
                    <span className="inline-flex items-start gap-2">
                      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-70" />
                      <span className="line-clamp-3 text-foreground" title={q.text}>
                        {q.text}
                      </span>
                    </span>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {filtered.map(r => {
              const blocks = parseTranscriptToBlocks(r.transcript ?? [], questions)
              const cells = blocksToRowCells(blocks, questions)
              const open = expandedId === r.id
              return (
                <Fragment key={r.id}>
                  <tr className="border-b border-border/80 transition-colors hover:bg-muted/30">
                    <td className="sticky left-0 z-10 border-r bg-card px-1 py-2 align-middle">
                      <button
                        type="button"
                        className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                        aria-expanded={open}
                        onClick={() => setExpandedId(open ? null : r.id)}
                      >
                        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </button>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 align-top text-muted-foreground">{formatResponseTime(r)}</td>
                    <td className="px-3 py-2 align-top">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
                          r.status === 'completed'
                            ? 'bg-muted text-foreground'
                            : r.status === 'abandoned'
                              ? 'bg-destructive/15 text-destructive'
                              : 'bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-100'
                        }`}
                      >
                        {r.status.replace(/_/g, ' ')}
                      </span>
                    </td>
                    {questions.map(q => (
                      <td
                        key={q.id}
                        className="max-w-[14rem] px-3 py-2 align-top text-foreground"
                        title={cells.get(q.id) ?? ''}
                      >
                        <div className="line-clamp-6 whitespace-pre-wrap break-words text-sm leading-relaxed">
                          {questions.length ? cells.get(q.id) ?? '—' : '—'}
                        </div>
                      </td>
                    ))}
                  </tr>
                  {open && (
                    <tr className="border-b bg-muted/20">
                      <td colSpan={3 + questions.length} className="px-4 py-4">
                        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          Full transcript
                        </p>
                        <TranscriptView
                          transcript={r.transcript ?? []}
                          summary={r.ai_summary}
                          summaryActions={{
                            loading: summaryGenId === r.id,
                            error: summaryErrById[r.id] ?? null,
                            onGenerate: () => void handleGenerateSummary(r.id),
                          }}
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
        </div>
      </div>

      {filtered.length === 0 && (
        <p className="text-center text-sm text-muted-foreground">No responses match your search or filters.</p>
      )}
    </div>
  )
}
