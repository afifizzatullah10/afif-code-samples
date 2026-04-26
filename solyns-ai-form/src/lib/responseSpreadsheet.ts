import type { DiscussionGuideQuestion, Form, Response, TranscriptMessage } from '@/lib/types'

export interface QuestionColumn {
  id: string
  header: string
}

export interface ParsedAnswerBlock {
  questionId: string
  questionText: string
  mainAnswer: string
  followUps: { question: string; answer: string }[]
}

function norm(s: string) {
  return s.trim().replace(/\s+/g, ' ')
}

/** Parse one-question-at-a-time transcript into blocks aligned to guide order. */
export function parseTranscriptToBlocks(
  transcript: TranscriptMessage[],
  questions: DiscussionGuideQuestion[]
): ParsedAnswerBlock[] {
  const blocks: ParsedAnswerBlock[] = []
  let guideIdx = 0
  let current: ParsedAnswerBlock | null = null

  const hasSource = transcript.some(m => m.source != null)
  const questionById = new Map(questions.map(q => [q.id, q]))
  const questionIndexById = new Map(questions.map((q, idx) => [q.id, idx]))
  const usedQuestionIds = new Set<string>()

  const questionsByNormText = new Map<string, DiscussionGuideQuestion[]>()
  for (const q of questions) {
    const key = norm(q.text)
    const arr = questionsByNormText.get(key)
    if (arr) {
      arr.push(q)
    } else {
      questionsByNormText.set(key, [q])
    }
  }

  const pickByText = (text: string): DiscussionGuideQuestion | undefined => {
    const candidates = questionsByNormText
      .get(norm(text))
      ?.filter(q => !usedQuestionIds.has(q.id))
    if (!candidates || candidates.length === 0) return undefined
    return candidates[0]
  }

  const pickByOrder = (): DiscussionGuideQuestion | undefined => {
    while (guideIdx < questions.length && usedQuestionIds.has(questions[guideIdx].id)) {
      guideIdx++
    }
    return questions[guideIdx]
  }

  const markPicked = (q: DiscussionGuideQuestion) => {
    usedQuestionIds.add(q.id)
    const idx = questionIndexById.get(q.id)
    if (idx != null && idx >= guideIdx) {
      guideIdx = idx + 1
    }
  }

  for (let i = 0; i < transcript.length; i++) {
    const m = transcript[i]
    if (m.role !== 'ai') continue
    const user = transcript[i + 1]
    if (!user || user.role !== 'user') continue

    if (hasSource) {
      if (m.source === 'ai_follow_up') {
        if (current) {
          current.followUps.push({ question: m.content, answer: user.content })
        }
        i++
        continue
      }
      // Planned question line: prefer stable question_id when present.
      const q =
        (m.question_id ? questionById.get(m.question_id) : undefined) ??
        pickByText(m.content) ??
        pickByOrder()
      if (!q) {
        i++
        continue
      }
      markPicked(q)
      current = {
        questionId: m.question_id ?? q.id,
        questionText: m.content,
        mainAnswer: user.content,
        followUps: [],
      }
      blocks.push(current)
      i++
      continue
    }

    // Legacy: no source — try text match first, then fallback to order.
    const q = pickByText(m.content) ?? pickByOrder()
    if (!q) break
    markPicked(q)
    current = {
      questionId: q.id,
      questionText: m.content,
      mainAnswer: user.content,
      followUps: [],
    }
    blocks.push(current)
    i++
  }

  return blocks
}

/** Match blocks to guide columns (handles reordered text vs guide). */
export function blocksToRowCells(
  blocks: ParsedAnswerBlock[],
  questions: DiscussionGuideQuestion[]
): Map<string, string> {
  const byId = new Map<string, ParsedAnswerBlock>()
  for (const b of blocks) {
    byId.set(b.questionId, b)
  }

  const cells = new Map<string, string>()
  for (const q of questions) {
    const b = byId.get(q.id) ?? blocks.find(x => norm(x.questionText) === norm(q.text))
    if (!b) {
      cells.set(q.id, '—')
      continue
    }
    const parts: string[] = [b.mainAnswer]
    b.followUps.forEach((fu, idx) => {
      parts.push(`[AI follow-up ${idx + 1}] ${fu.question}`)
      parts.push(`→ ${fu.answer}`)
    })
    cells.set(q.id, parts.join('\n'))
  }
  return cells
}

export function buildQuestionColumns(form: Form | null): QuestionColumn[] {
  const qs = form?.discussion_guide?.questions ?? []
  return qs.map(q => ({
    id: q.id,
    header: q.text.length > 48 ? `${q.text.slice(0, 45)}…` : q.text,
  }))
}

export function formatResponseTime(r: Response) {
  const d = new Date(r.started_at)
  return d.toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function buildExportRows(
  form: Form,
  responses: Response[],
  columns: QuestionColumn[]
): string[][] {
  const header = ['Response ID', 'Response time', 'Response type', ...columns.map(c => c.header)]
  const rows: string[][] = [header]

  for (const r of responses) {
    const blocks = parseTranscriptToBlocks(r.transcript ?? [], form.discussion_guide?.questions ?? [])
    const cells = blocksToRowCells(blocks, form.discussion_guide?.questions ?? [])
    const row = [
      r.id,
      formatResponseTime(r),
      r.status.replace(/_/g, ' '),
      ...columns.map(c => cells.get(c.id) ?? '—'),
    ]
    rows.push(row)
  }
  return rows
}

export function toCsv(rows: string[][]): string {
  const esc = (v: string) => {
    if (/[",\r\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`
    return v
  }
  return rows.map(cols => cols.map(esc).join(',')).join('\r\n')
}

export function sanitizeFilename(title: string) {
  const s = title.trim().replace(/[^\w\s\-]+/g, '').replace(/\s+/g, '-')
  return s.slice(0, 72) || 'form'
}

function triggerBlobDownload(blob: Blob, filename: string) {
  const a = document.createElement('a')
  const url = URL.createObjectURL(blob)
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/** UTF-8 BOM so Excel opens CSV correctly */
export function downloadResponsesCsv(filename: string, rows: string[][]) {
  const blob = new Blob([`\uFEFF${toCsv(rows)}`], { type: 'text/csv;charset=utf-8;' })
  triggerBlobDownload(blob, filename.endsWith('.csv') ? filename : `${filename}.csv`)
}

export async function downloadResponsesXlsx(filename: string, rows: string[][]) {
  const XLSX = await import('xlsx')
  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.aoa_to_sheet(rows)
  XLSX.utils.book_append_sheet(wb, ws, 'Responses')
  const name = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`
  XLSX.writeFile(wb, name)
}
