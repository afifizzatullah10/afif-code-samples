import { useState } from 'react'
import type { QuestionType, DiscussionGuideQuestion } from '@/lib/types'
import {
  AlignLeft,
  Type,
  List,
  ListFilter,
  Hash,
  Star,
  ThumbsUp,
  ToggleLeft,
  Gauge,
  FileText,
  X,
  Mail,
  Phone,
  Link2,
  Calendar,
  Scale,
  Search,
  Sparkles,
} from 'lucide-react'
import { newQuestionId } from '@/lib/questionId'
import { cn } from '@/lib/utils'

interface ElementPickerProps {
  open: boolean
  onClose: () => void
  onAdd: (question: DiscussionGuideQuestion) => void
}

interface QuestionTypeOption {
  type: QuestionType
  label: string
  icon: React.ReactNode
  category: string
  defaults?: Partial<DiscussionGuideQuestion>
}

const QUESTION_TYPES: QuestionTypeOption[] = [
  // Recommended
  { type: 'short_text', label: 'Short Text', icon: <Type className="h-4 w-4" />, category: 'Recommended' },
  { type: 'long_text', label: 'Long Text', icon: <AlignLeft className="h-4 w-4" />, category: 'Recommended' },
  { type: 'multiple_choice', label: 'Multiple Choice', icon: <List className="h-4 w-4" />, category: 'Recommended' },
  // Contact info
  { type: 'email', label: 'Email', icon: <Mail className="h-4 w-4" />, category: 'Contact info' },
  { type: 'phone', label: 'Phone number', icon: <Phone className="h-4 w-4" />, category: 'Contact info' },
  { type: 'url', label: 'Website', icon: <Link2 className="h-4 w-4" />, category: 'Contact info' },
  // Text
  { type: 'long_text', label: 'Long Text', icon: <AlignLeft className="h-4 w-4" />, category: 'Text' },
  { type: 'short_text', label: 'Short Text', icon: <Type className="h-4 w-4" />, category: 'Text' },
  // Choice
  { type: 'multiple_choice', label: 'Multiple Choice', icon: <List className="h-4 w-4" />, category: 'Choice' },
  { type: 'dropdown', label: 'Dropdown', icon: <ListFilter className="h-4 w-4" />, category: 'Choice' },
  {
    type: 'multiple_choice',
    label: 'Checkbox',
    icon: <List className="h-4 w-4" />,
    category: 'Choice',
    defaults: { allow_multiple: true },
  },
  { type: 'yes_no', label: 'Yes / No', icon: <ToggleLeft className="h-4 w-4" />, category: 'Choice' },
  { type: 'legal', label: 'Legal', icon: <Scale className="h-4 w-4" />, category: 'Choice' },
  // Rating
  { type: 'nps', label: 'Net Promoter Score', icon: <Gauge className="h-4 w-4" />, category: 'Rating' },
  { type: 'opinion_scale', label: 'Opinion Scale', icon: <Star className="h-4 w-4" />, category: 'Rating' },
  { type: 'rating', label: 'Rating', icon: <ThumbsUp className="h-4 w-4" />, category: 'Rating' },
  // Other
  { type: 'number', label: 'Number', icon: <Hash className="h-4 w-4" />, category: 'Other' },
  { type: 'date', label: 'Date', icon: <Calendar className="h-4 w-4" />, category: 'Other' },
  { type: 'statement', label: 'Statement', icon: <FileText className="h-4 w-4" />, category: 'Other' },
]

const CATEGORY_ORDER = [
  'Recommended',
  'Contact info',
  'Text',
  'Choice',
  'Rating',
  'Other',
] as const

function defaultQuestion(
  type: QuestionType,
  id: string,
  overrides?: Partial<DiscussionGuideQuestion>
): DiscussionGuideQuestion {
  const base: DiscussionGuideQuestion = {
    id,
    text: '',
    type,
    required: true,
    ai_follow_up_enabled: type === 'long_text' || type === 'short_text',
    follow_up_instructions: null,
    max_follow_ups: type === 'long_text' ? 2 : 1,
  }

  if (type === 'multiple_choice' || type === 'dropdown') {
    base.options = ['Option 1', 'Option 2', 'Option 3']
    base.allow_multiple = type === 'multiple_choice' ? (overrides?.allow_multiple ?? false) : false
    base.allow_other_option = false
    base.other_option_label = null
    base.require_other_text = false
  }
  if (type === 'rating' || type === 'opinion_scale') {
    base.scale = { min: 1, max: 5, min_label: '', max_label: '' }
  }
  if (type === 'nps') {
    base.scale = { min: 0, max: 10 }
  }
  if (type === 'legal') {
    base.text = 'I agree to the terms and conditions'
    base.required = true
    base.ai_follow_up_enabled = false
    base.max_follow_ups = 1
  }
  if (type === 'email' || type === 'url' || type === 'phone' || type === 'date') {
    base.ai_follow_up_enabled = false
    base.max_follow_ups = 1
  }
  if (type === 'statement') {
    base.required = false
    base.ai_follow_up_enabled = false
    base.max_follow_ups = 1
  }

  return { ...base, ...overrides }
}

export function ElementPicker({ open, onClose, onAdd }: ElementPickerProps) {
  const [search, setSearch] = useState('')

  if (!open) return null

  const q = search.trim().toLowerCase()
  const filtered = q
    ? QUESTION_TYPES.filter(
        t =>
          t.label.toLowerCase().includes(q) ||
          t.category.toLowerCase().includes(q) ||
          t.type.replace('_', ' ').includes(q)
      )
    : QUESTION_TYPES

  const categories = CATEGORY_ORDER.filter(c => filtered.some(t => t.category === c))

  const handlePick = (opt: QuestionTypeOption) => {
    onAdd(defaultQuestion(opt.type, newQuestionId(), opt.defaults))
    onClose()
    setSearch('')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        className={cn(
          'flex max-h-[min(88vh,920px)] w-full max-w-5xl flex-col overflow-hidden rounded-xl border bg-background shadow-xl'
        )}
        role="dialog"
        aria-labelledby="element-picker-title"
      >
        <div className="shrink-0 border-b px-5 pb-4 pt-5 sm:px-6">
          <div className="flex items-start justify-between gap-4">
            <h2 id="element-picker-title" className="text-lg font-semibold tracking-tight">
              Add AI form elements
            </h2>
            <button
              type="button"
              onClick={() => {
                onClose()
                setSearch('')
              }}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="relative mt-4">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search AI form elements"
              autoFocus
              className="w-full rounded-md border border-input bg-transparent py-2.5 pl-10 pr-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
          {categories.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No elements match your search.</p>
          ) : (
            <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
              {categories.map(cat => (
                <div key={cat} className="min-w-0">
                  <h3 className="mb-3 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {cat}
                    {cat === 'Recommended' && (
                      <Sparkles className="h-3 w-3 text-amber-500" aria-hidden />
                    )}
                  </h3>
                  <div className="space-y-1">
                    {filtered
                      .filter(t => t.category === cat)
                      .map((t, idx) => (
                        <button
                          key={`${cat}-${t.type}-${t.label}-${idx}`}
                          type="button"
                          onClick={() => handlePick(t)}
                          className="flex w-full items-center gap-2.5 rounded-lg border border-transparent px-2.5 py-2 text-left text-sm transition-colors hover:border-input hover:bg-muted/60"
                        >
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                            {t.icon}
                          </span>
                          <span className="min-w-0 leading-snug">{t.label}</span>
                        </button>
                      ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
