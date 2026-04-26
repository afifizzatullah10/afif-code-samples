import { useRef, useState, type ChangeEvent } from 'react'
import type { DiscussionGuideQuestion, QuestionType } from '@/lib/types'
import { uploadFormQuestionImage } from '@/lib/uploadFormWelcomeImage'
import { Button } from '@/components/ui/button'
import { ImageIcon, Loader2, Sparkles, Upload, X } from 'lucide-react'

const TYPE_LABELS: Record<QuestionType, string> = {
  short_text: 'Short Text',
  long_text: 'Long Text',
  multiple_choice: 'Multiple Choice',
  dropdown: 'Dropdown',
  yes_no: 'Yes / No',
  nps: 'Net Promoter Score',
  opinion_scale: 'Opinion Scale',
  rating: 'Rating',
  number: 'Number',
  statement: 'Statement',
  email: 'Email',
  url: 'Website',
  phone: 'Phone',
  date: 'Date',
  legal: 'Legal / Consent',
}

const ALL_TYPES: QuestionType[] = [
  'long_text',
  'short_text',
  'multiple_choice',
  'dropdown',
  'yes_no',
  'nps',
  'opinion_scale',
  'rating',
  'number',
  'email',
  'url',
  'phone',
  'date',
  'legal',
  'statement',
]

interface QuestionSettingsProps {
  question: DiscussionGuideQuestion
  onChange: (updated: DiscussionGuideQuestion) => void
  /** Folder segment for Storage paths (`form.id` or draft folder). */
  storageFolder: string
}

export function QuestionSettings({
  question,
  onChange,
  storageFolder,
}: QuestionSettingsProps) {
  const update = (partial: Partial<DiscussionGuideQuestion>) =>
    onChange({ ...question, ...partial })

  const questionImageInputRef = useRef<HTMLInputElement>(null)
  const [questionImageUploading, setQuestionImageUploading] = useState(false)
  const [questionImageError, setQuestionImageError] = useState<string | null>(null)

  const handleQuestionImageFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setQuestionImageError(null)
    setQuestionImageUploading(true)
    try {
      const url = await uploadFormQuestionImage(file, storageFolder, question.id)
      update({ image_url: url })
    } catch (err) {
      setQuestionImageError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setQuestionImageUploading(false)
    }
  }

  const isAiTextType = question.type === 'short_text' || question.type === 'long_text'
  const isScaleType = question.type === 'rating' || question.type === 'opinion_scale'
  const isChoiceType = question.type === 'multiple_choice' || question.type === 'dropdown'

  return (
    <div className="flex min-h-0 h-full flex-1 flex-col overflow-hidden">
      <div className="shrink-0 border-b px-4 py-3">
        <h3 className="text-sm font-semibold">Question Settings</h3>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="space-y-5 p-4">
        {/* Type selector */}
        <div>
          <label className="text-xs font-medium text-muted-foreground">Type</label>
          <select
            value={question.type}
            onChange={e => {
              const newType = e.target.value as QuestionType
              const updates: Partial<DiscussionGuideQuestion> = { type: newType }
              if ((newType === 'multiple_choice' || newType === 'dropdown') && !question.options) {
                updates.options = ['Option 1', 'Option 2', 'Option 3']
              }
              if (newType === 'multiple_choice' || newType === 'dropdown') {
                updates.allow_other_option = question.allow_other_option ?? false
                updates.require_other_text = question.require_other_text ?? false
                updates.other_option_label = question.other_option_label ?? null
              } else {
                updates.allow_other_option = false
                updates.require_other_text = false
                updates.other_option_label = null
              }
              if (newType === 'dropdown') {
                updates.allow_multiple = false
              }
              if ((newType === 'rating' || newType === 'opinion_scale') && !question.scale) {
                updates.scale = { min: 1, max: 5, min_label: '', max_label: '' }
              }
              if (newType === 'nps') {
                updates.scale = { min: 0, max: 10 }
              }
              if (newType === 'short_text' || newType === 'long_text') {
                updates.ai_follow_up_enabled = true
                updates.max_follow_ups = newType === 'long_text' ? 2 : 1
              } else {
                updates.ai_follow_up_enabled = false
                updates.max_follow_ups = 1
                updates.image_url = null
              }
              update(updates)
            }}
            className="mt-1 w-full rounded-md border border-input bg-transparent px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          >
            {ALL_TYPES.map(t => (
              <option key={t} value={t}>{TYPE_LABELS[t]}</option>
            ))}
          </select>
        </div>

        {/* Optional image — short / long text only */}
        {isAiTextType ? (
          <div>
            <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <ImageIcon className="h-3.5 w-3.5 shrink-0" aria-hidden />
              Question image (optional)
            </label>
            <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
              Shown above this question on the respondent page. JPEG, PNG, GIF, WebP, or AVIF — max 5 MB.
            </p>
            <input
              ref={questionImageInputRef}
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp,image/avif"
              className="sr-only"
              onChange={handleQuestionImageFile}
            />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={questionImageUploading}
                onClick={() => questionImageInputRef.current?.click()}
                className="gap-1.5"
              >
                {questionImageUploading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Upload className="h-3.5 w-3.5" />
                )}
                {question.image_url?.trim() ? 'Replace image' : 'Upload from computer'}
              </Button>
              {question.image_url?.trim() ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground"
                  onClick={() => {
                    update({ image_url: null })
                    setQuestionImageError(null)
                  }}
                >
                  <X className="mr-1 h-3.5 w-3.5" />
                  Remove
                </Button>
              ) : null}
            </div>
            {question.image_url?.trim() ? (
              <div className="mt-3 overflow-hidden rounded-lg border bg-muted/30">
                <img
                  src={question.image_url.trim()}
                  alt=""
                  className="max-h-36 w-full object-cover"
                />
              </div>
            ) : null}
            {questionImageError ? (
              <p className="mt-2 text-xs text-destructive">{questionImageError}</p>
            ) : null}
          </div>
        ) : null}

        {/* Required */}
        <label className="flex items-center justify-between">
          <span className="text-sm">Required</span>
          <input
            type="checkbox"
            checked={question.required}
            onChange={e => update({ required: e.target.checked })}
            className="h-4 w-4 rounded border-input accent-primary"
          />
        </label>

        {/* Multiple selection (MC only) */}
        {question.type === 'multiple_choice' && (
          <label className="flex items-center justify-between">
            <span className="text-sm">Allow multiple</span>
            <input
              type="checkbox"
              checked={question.allow_multiple ?? false}
              onChange={e => update({ allow_multiple: e.target.checked })}
              className="h-4 w-4 rounded border-input accent-primary"
            />
          </label>
        )}

        {isChoiceType && (
          <div className="space-y-3 rounded-lg border border-input/70 p-3">
            <label className="flex items-center justify-between">
              <span className="text-sm">Add Others option</span>
              <input
                type="checkbox"
                checked={question.allow_other_option ?? false}
                onChange={e =>
                  update({
                    allow_other_option: e.target.checked,
                    require_other_text: e.target.checked ? (question.require_other_text ?? false) : false,
                    other_option_label: e.target.checked ? (question.other_option_label ?? null) : null,
                  })
                }
                className="h-4 w-4 rounded border-input accent-primary"
              />
            </label>

            {question.allow_other_option && (
              <>
                <div>
                  <label className="text-xs text-muted-foreground">Others label</label>
                  <input
                    value={question.other_option_label ?? ''}
                    onChange={e => update({ other_option_label: e.target.value || null })}
                    placeholder="Others"
                    className="mt-0.5 w-full rounded-md border border-input bg-transparent px-2 py-1 text-sm placeholder:text-muted-foreground/50"
                  />
                </div>
                <label className="flex items-center justify-between">
                  <span className="text-sm">Require respondents to specify</span>
                  <input
                    type="checkbox"
                    checked={question.require_other_text ?? false}
                    onChange={e => update({ require_other_text: e.target.checked })}
                    className="h-4 w-4 rounded border-input accent-primary"
                  />
                </label>
              </>
            )}
          </div>
        )}

        {/* Scale config */}
        {isScaleType && question.scale && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-muted-foreground">Min</label>
                <input
                  type="number"
                  value={question.scale.min}
                  onChange={e => update({ scale: { ...question.scale!, min: Number(e.target.value) } })}
                  className="mt-0.5 w-full rounded-md border border-input bg-transparent px-2 py-1 text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Max</label>
                <input
                  type="number"
                  value={question.scale.max}
                  onChange={e => update({ scale: { ...question.scale!, max: Number(e.target.value) } })}
                  className="mt-0.5 w-full rounded-md border border-input bg-transparent px-2 py-1 text-sm"
                />
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Min label</label>
              <input
                value={question.scale.min_label ?? ''}
                onChange={e => update({ scale: { ...question.scale!, min_label: e.target.value } })}
                placeholder="e.g., Poor"
                className="mt-0.5 w-full rounded-md border border-input bg-transparent px-2 py-1 text-sm placeholder:text-muted-foreground/50"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Max label</label>
              <input
                value={question.scale.max_label ?? ''}
                onChange={e => update({ scale: { ...question.scale!, max_label: e.target.value } })}
                placeholder="e.g., Excellent"
                className="mt-0.5 w-full rounded-md border border-input bg-transparent px-2 py-1 text-sm placeholder:text-muted-foreground/50"
              />
            </div>
          </div>
        )}

        {/* Divider */}
        <div className="border-t pt-4">
          <h4 className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5 shrink-0 text-gold" aria-hidden />
            AI Follow-ups
          </h4>

          <label className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-sm">
              <Sparkles className="h-3.5 w-3.5 shrink-0 text-gold" aria-hidden />
              Enable AI follow-ups
            </span>
            <input
              type="checkbox"
              checked={question.ai_follow_up_enabled}
              onChange={e => update({ ai_follow_up_enabled: e.target.checked })}
              className="h-4 w-4 rounded border-input accent-primary"
              disabled={!isAiTextType}
            />
          </label>
          {!isAiTextType && (
            <p className="mt-1 flex items-start gap-2 text-xs text-muted-foreground">
              <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gold/80" aria-hidden />
              <span>AI follow-ups are only available for short and long text questions.</span>
            </p>
          )}

          {question.ai_follow_up_enabled && isAiTextType && (
            <div className="mt-3 space-y-3">
              <div>
                <div className="flex items-baseline justify-between">
                  <label className="text-xs text-muted-foreground">Max follow-up probes</label>
                  <span className="text-sm font-medium text-foreground">{question.max_follow_ups}</span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={3}
                  value={question.max_follow_ups}
                  onChange={e => update({ max_follow_ups: Number(e.target.value) })}
                  className="mt-1 w-full accent-primary"
                />
              </div>

              <div>
                <label className="text-xs text-muted-foreground">Follow-up instructions</label>
                <textarea
                  value={question.follow_up_instructions ?? ''}
                  onChange={e => update({ follow_up_instructions: e.target.value || null })}
                  rows={3}
                  placeholder="If the answer is vague, ask for a specific example..."
                  className="mt-1 w-full resize-none rounded-md border border-input bg-transparent px-2 py-1.5 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
            </div>
          )}
        </div>
        </div>
      </div>
    </div>
  )
}
