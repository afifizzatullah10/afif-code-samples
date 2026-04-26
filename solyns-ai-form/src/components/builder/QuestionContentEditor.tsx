import type { DiscussionGuideQuestion } from '@/lib/types'
import { Plus, X } from 'lucide-react'

interface QuestionContentEditorProps {
  question: DiscussionGuideQuestion
  questionNumber: number
  onChange: (updated: DiscussionGuideQuestion) => void
}

export function QuestionContentEditor({
  question,
  questionNumber,
  onChange,
}: QuestionContentEditorProps) {
  const update = (partial: Partial<DiscussionGuideQuestion>) =>
    onChange({ ...question, ...partial })

  return (
    <div className="flex justify-center p-8">
      <div className="w-full max-w-xl space-y-6">
        {/* Question number + text */}
        <div>
          <p className="mb-2 text-sm font-medium text-primary">{questionNumber} →</p>
          <textarea
            value={question.text}
            onChange={e => update({ text: e.target.value })}
            placeholder="Type your question here..."
            rows={2}
            className="w-full resize-none border-none bg-transparent text-xl font-semibold leading-snug tracking-tight placeholder:text-muted-foreground/50 focus:outline-none sm:text-2xl"
          />
        </div>

        {/* Description */}
        <textarea
          value={question.description ?? ''}
          onChange={e => update({ description: e.target.value || undefined })}
          placeholder="Description (optional)"
          rows={1}
          className="w-full resize-none border-none bg-transparent text-sm text-muted-foreground placeholder:text-muted-foreground/40 focus:outline-none"
        />

        {/* Answer preview */}
        <div className="rounded-lg border border-dashed border-input p-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Answer preview
          </p>

          {(question.type === 'short_text' || question.type === 'long_text') && (
            <div className="rounded-md border border-input bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
              {question.type === 'long_text'
                ? 'Type your answer here...'
                : 'Type a short answer...'}
            </div>
          )}

          {(question.type === 'email' ||
            question.type === 'url' ||
            question.type === 'phone' ||
            question.type === 'date') && (
            <div className="rounded-md border border-input bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
              {question.type === 'email' && 'name@example.com'}
              {question.type === 'url' && 'https://...'}
              {question.type === 'phone' && '+1 555 000 0000'}
              {question.type === 'date' && 'YYYY-MM-DD'}
            </div>
          )}

          {(question.type === 'multiple_choice' || question.type === 'dropdown') && (
            <div className="space-y-2">
              {(question.options ?? []).map((opt, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded border text-xs">
                    {String.fromCharCode(65 + i)}
                  </span>
                  <input
                    value={opt}
                    onChange={e => {
                      const newOpts = [...(question.options ?? [])]
                      newOpts[i] = e.target.value
                      update({ options: newOpts })
                    }}
                    className="flex-1 border-none bg-transparent text-sm focus:outline-none"
                  />
                  <button
                    onClick={() => {
                      const newOpts = (question.options ?? []).filter((_, j) => j !== i)
                      update({ options: newOpts })
                    }}
                    className="rounded p-0.5 text-muted-foreground hover:text-destructive"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
                {question.allow_other_option && (
                  <div className="flex items-center gap-2 rounded-md border border-dashed border-input px-2 py-1.5">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded border text-xs">
                      +
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {question.other_option_label?.trim() || 'Others'}
                      {question.require_other_text ? ' (requires text)' : ''}
                    </span>
                  </div>
                )}
              <button
                onClick={() => update({ options: [...(question.options ?? []), `Option ${(question.options?.length ?? 0) + 1}`] })}
                className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary"
              >
                <Plus className="h-3.5 w-3.5" /> Add option
              </button>
            </div>
          )}

          {question.type === 'yes_no' && (
            <div className="flex gap-2">
              <div className="flex-1 rounded-md border border-input py-2 text-center text-sm">
                Yes
              </div>
              <div className="flex-1 rounded-md border border-input py-2 text-center text-sm">
                No
              </div>
            </div>
          )}

          {question.type === 'nps' && (
            <div className="flex justify-between gap-1">
              {Array.from({ length: 11 }, (_, i) => (
                <div
                  key={i}
                  className="flex h-8 w-full items-center justify-center rounded border border-input text-xs"
                >
                  {i}
                </div>
              ))}
            </div>
          )}

          {(question.type === 'rating' || question.type === 'opinion_scale') && (
            <div className="flex justify-between gap-1.5">
              {Array.from(
                { length: (question.scale?.max ?? 5) - (question.scale?.min ?? 1) + 1 },
                (_, i) => (question.scale?.min ?? 1) + i
              ).map(val => (
                <div
                  key={val}
                  className="flex h-10 w-full items-center justify-center rounded border border-input text-sm"
                >
                  {val}
                </div>
              ))}
            </div>
          )}

          {question.type === 'number' && (
            <div className="rounded-md border border-input bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
              Type a number...
            </div>
          )}

          {question.type === 'statement' && (
            <p className="text-sm text-muted-foreground italic">
              This is an informational slide. No answer required.
            </p>
          )}

          {question.type === 'legal' && (
            <label className="flex cursor-pointer items-start gap-2 text-sm">
              <span className="mt-0.5 inline-flex h-4 w-4 shrink-0 rounded border border-input bg-background" />
              <span className="text-muted-foreground">
                {question.text || 'I agree to the terms'}
              </span>
            </label>
          )}
        </div>
      </div>
    </div>
  )
}
