import { useState, useEffect, useCallback, useRef, type ChangeEvent } from 'react'
import { useNavigate, useParams, useSearchParams, useMatch, Link } from 'react-router-dom'
import { fetchForm, updateForm, updateFormStatus, createForm } from '@/lib/api'
import { uploadFormWelcomeImage } from '@/lib/uploadFormWelcomeImage'
import { QuestionList } from '@/components/builder/QuestionList'
import { QuestionContentEditor } from '@/components/builder/QuestionContentEditor'
import { QuestionSettings } from '@/components/builder/QuestionSettings'
import { ElementPicker } from '@/components/builder/ElementPicker'
import { ChatToCreateTeaser } from '@/components/builder/ChatToCreateTeaser'
import { Button } from '@/components/ui/button'
import type { Form, FormBranding, DiscussionGuide, DiscussionGuideQuestion } from '@/lib/types'
import {
  Loader2,
  ArrowLeft,
  Eye,
  Rocket,
  Save,
  Copy,
  Check,
  Settings,
  Paintbrush,
  FileText,
  ImageIcon,
  Upload,
  Mic,
} from 'lucide-react'

type BuilderTab = 'content' | 'design' | 'settings'

export default function StudyBuilder() {
  const navigate = useNavigate()
  const { id } = useParams()
  const [searchParams] = useSearchParams()
  const workspaceContent = useMatch({ path: '/form/:id/content', end: true })

  const [form, setForm] = useState<Form | null>(null)
  const [loading, setLoading] = useState(!!id)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [title, setTitle] = useState('')
  const [guide, setGuide] = useState<DiscussionGuide>({
    questions: [],
    system_instructions: '',
    estimated_duration_minutes: 5,
  })
  const [welcomeMessage, setWelcomeMessage] = useState('')
  const [thankYouMessage, setThankYouMessage] = useState('Thank you for your time!')
  const [language, setLanguage] = useState<'en' | 'id'>('en')
  const [objective, setObjective] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [primaryColor, setPrimaryColor] = useState('')
  const [welcomeImageUrl, setWelcomeImageUrl] = useState('')
  const [readAloudDefaultEnabled, setReadAloudDefaultEnabled] = useState(true)
  const [welcomeImageUploading, setWelcomeImageUploading] = useState(false)
  const [welcomeImageUploadError, setWelcomeImageUploadError] = useState<string | null>(null)
  const welcomeImageDraftFolderRef = useRef<string | null>(null)
  const welcomeImageFileInputRef = useRef<HTMLInputElement>(null)
  const [maxResponses, setMaxResponses] = useState('')
  const [redirectUrl, setRedirectUrl] = useState('')

  const [selectedQuestion, setSelectedQuestion] = useState(0)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<BuilderTab>('content')
  const [copied, setCopied] = useState(false)
  const [goLiveSuccess, setGoLiveSuccess] = useState(false)

  // Load existing form
  useEffect(() => {
    if (!id) {
      // Check if we have a guide passed via search params (from AI generation)
      const guideParam = searchParams.get('guide')
      if (guideParam) {
        try {
          const parsed = JSON.parse(decodeURIComponent(guideParam)) as DiscussionGuide
          setGuide({ ...parsed, created_with_ai: true })
        } catch { /* ignore */ }
      }
      setTitle(searchParams.get('title') || '')
      setObjective(searchParams.get('objective') || '')
      setLanguage((searchParams.get('language') as 'en' | 'id') || 'en')
      setCompanyName(searchParams.get('company') || '')
      setWelcomeMessage(searchParams.get('welcome') || '')
      setLoading(false)
      return
    }

    fetchForm(id)
      .then(f => {
        setForm(f)
        setTitle(f.title)
        setObjective(f.objective)
        setLanguage(f.language)
        setCompanyName(f.branding?.company_name || '')
        setPrimaryColor(f.branding?.primary_color || '')
        setWelcomeImageUrl(f.branding?.welcome_image_url || '')
        setReadAloudDefaultEnabled(f.branding?.ai_read_aloud_enabled ?? true)
        setWelcomeMessage(f.welcome_message || '')
        setThankYouMessage(f.thank_you_message || 'Thank you for your time!')
        setMaxResponses(f.max_responses ? String(f.max_responses) : '')
        setRedirectUrl(f.redirect_url || '')
        if (f.discussion_guide) {
          setGuide(f.discussion_guide)
        }
      })
      .catch(() => setError('Failed to load form'))
      .finally(() => setLoading(false))
  }, [id])

  // Sync title when renamed from workspace header (pencil icon)
  useEffect(() => {
    if (!id) return
    const onTitle = (e: Event) => {
      const d = (e as CustomEvent<{ id: string; title: string }>).detail
      if (d?.id === id) setTitle(d.title)
    }
    window.addEventListener('solyns:form-title', onTitle)
    return () => window.removeEventListener('solyns:form-title', onTitle)
  }, [id])

  const currentQ = guide.questions[selectedQuestion] ?? null

  /** Shared draft folder for welcome + question images before the form row exists. */
  const assetStorageFolder =
    form?.id ??
    (welcomeImageDraftFolderRef.current ??= `draft-${crypto.randomUUID()}`)

  const updateQuestion = useCallback(
    (updated: DiscussionGuideQuestion) => {
      setGuide(prev => ({
        ...prev,
        questions: prev.questions.map((q, i) =>
          i === selectedQuestion ? updated : q
        ),
      }))
    },
    [selectedQuestion]
  )

  const handleReorder = (from: number, to: number) => {
    const qs = [...guide.questions]
    const [moved] = qs.splice(from, 1)
    qs.splice(to, 0, moved)
    // Keep stable question ids so saved responses map to the correct column.
    setGuide(prev => ({ ...prev, questions: qs }))
    setSelectedQuestion(to)
  }

  const handleDelete = (index: number) => {
    if (guide.questions.length <= 1) return
    const qs = guide.questions.filter((_, i) => i !== index)
    setGuide(prev => ({ ...prev, questions: qs }))
    setSelectedQuestion(Math.min(selectedQuestion, qs.length - 1))
  }

  const handleAddQuestion = (q: DiscussionGuideQuestion) => {
    setGuide(prev => ({ ...prev, questions: [...prev.questions, q] }))
    setSelectedQuestion(guide.questions.length)
  }

  const buildBrandingPayload = (): FormBranding => {
    const b: FormBranding = { ...(form?.branding ?? {}) }
    if (companyName.trim()) b.company_name = companyName.trim()
    else delete b.company_name
    if (primaryColor.trim()) b.primary_color = primaryColor.trim()
    else delete b.primary_color
    if (welcomeImageUrl.trim()) b.welcome_image_url = welcomeImageUrl.trim()
    else delete b.welcome_image_url
    b.ai_read_aloud_enabled = readAloudDefaultEnabled
    return b
  }

  const buildStudyPayload = () => ({
    title: title || 'Untitled Form',
    objective,
    language,
    discussion_guide: guide,
    welcome_message: welcomeMessage,
    thank_you_message: thankYouMessage,
    redirect_url: redirectUrl || null,
    max_responses: maxResponses ? Number(maxResponses) : null,
    branding: buildBrandingPayload(),
  })

  const notifyFormUpdated = (formId: string) => {
    window.dispatchEvent(new CustomEvent('solyns:form-updated', { detail: { id: formId } }))
  }

  const handleToolbarLanguageChange = useCallback(
    async (next: 'en' | 'id') => {
      if (next === language) return
      const prev = language
      const formId = form?.id
      setLanguage(next)
      if (!formId) return
      try {
        const updated = await updateForm(formId, { language: next })
        setForm(updated)
      } catch {
        setLanguage(prev)
      }
    },
    [language, form?.id]
  )

  const handleWelcomeImageFile = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      e.target.value = ''
      if (!file) return
      setWelcomeImageUploadError(null)
      setWelcomeImageUploading(true)
      try {
        const folder =
          form?.id ??
          (welcomeImageDraftFolderRef.current ??= `draft-${crypto.randomUUID()}`)
        const url = await uploadFormWelcomeImage(file, folder)
        setWelcomeImageUrl(url)
      } catch (err) {
        setWelcomeImageUploadError(
          err instanceof Error ? err.message : 'Upload failed'
        )
      } finally {
        setWelcomeImageUploading(false)
      }
    },
    [form?.id]
  )

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      if (form) {
        const updated = await updateForm(form.id, buildStudyPayload())
        setForm(updated)
        notifyFormUpdated(updated.id)
        window.dispatchEvent(
          new CustomEvent('solyns:form-title', { detail: { id: updated.id, title: updated.title } })
        )
      } else {
        const created = await createForm({
          title: title || 'Untitled Form',
          objective,
          language,
          discussion_guide: guide,
          welcome_message: welcomeMessage,
          thank_you_message: thankYouMessage,
          branding: buildBrandingPayload(),
        })
        setForm(created)
        notifyFormUpdated(created.id)
        navigate(`/form/${created.id}/content`, { replace: true })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const handleGoLive = async () => {
    setSaving(true)
    setError(null)
    try {
      let currentForm = form
      if (!currentForm) {
        currentForm = await createForm({
          title: title || 'Untitled Form',
          objective,
          language,
          discussion_guide: guide,
          welcome_message: welcomeMessage,
          thank_you_message: thankYouMessage,
          branding: buildBrandingPayload(),
        })
        setForm(currentForm)
      } else {
        currentForm = await updateForm(currentForm.id, buildStudyPayload())
        setForm(currentForm)
        notifyFormUpdated(currentForm.id)
        window.dispatchEvent(
          new CustomEvent('solyns:form-title', { detail: { id: currentForm.id, title: currentForm.title } })
        )
      }
      await updateFormStatus(currentForm.id, 'active')
      setForm(prev => prev ? { ...prev, status: 'active' } : null)
      setGoLiveSuccess(true)
      navigate(`/form/${currentForm.id}/share`, { replace: false })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to go live')
    } finally {
      setSaving(false)
    }
  }

  const shareUrl = form?.share_slug
    ? `${window.location.origin}/s/${form.share_slug}`
    : ''

  const handleCopy = () => {
    navigator.clipboard.writeText(shareUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div
      className={
        workspaceContent
          ? 'flex min-h-0 flex-1 flex-col bg-background'
          : 'flex h-screen min-h-0 flex-col bg-background'
      }
    >
      {/* Top toolbar */}
      <header className="flex shrink-0 items-center gap-3 border-b px-4 py-2">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <button
            onClick={() => navigate('/dashboard')}
            className="rounded-md p-1.5 text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Untitled AI Form"
            className="min-w-0 flex-1 border-none bg-transparent text-sm font-semibold focus:outline-none"
          />
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <label htmlFor="builder-toolbar-language" className="sr-only">
            AI form language (voice and transcription)
          </label>
          <div className="flex shrink-0 items-center gap-1.5 rounded-md border border-border bg-muted/40 px-2 py-1">
            <Mic className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
            <select
              id="builder-toolbar-language"
              value={language}
              onChange={e => void handleToolbarLanguageChange(e.target.value as 'en' | 'id')}
              className="max-w-[10rem] cursor-pointer border-0 bg-transparent py-0.5 text-xs font-medium text-foreground focus:outline-none focus:ring-0"
            >
              <option value="en">English</option>
              <option value="id">Bahasa Indonesia</option>
            </select>
          </div>
          {/* Tab switcher — language sits immediately to the left */}
          <div className="flex shrink-0 rounded-md border">
            {([
              { tab: 'content' as const, icon: <FileText className="h-3.5 w-3.5" />, label: 'Content' },
              { tab: 'design' as const, icon: <Paintbrush className="h-3.5 w-3.5" />, label: 'Design' },
              { tab: 'settings' as const, icon: <Settings className="h-3.5 w-3.5" />, label: 'Settings' },
            ]).map(({ tab, icon, label }) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors ${
                  activeTab === tab
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {icon} {label}
              </button>
            ))}
          </div>

          {form?.id ? (
            <Button size="sm" variant="ghost" asChild>
              <Link to={`/form/${form.id}/preview`} target="_blank" rel="noopener noreferrer">
                <Eye className="mr-1 h-3.5 w-3.5" /> Preview
              </Link>
            </Button>
          ) : (
            <Button size="sm" variant="ghost" disabled title="Save the AI form once to enable preview">
              <Eye className="mr-1 h-3.5 w-3.5" /> Preview
            </Button>
          )}

          <Button size="sm" variant="outline" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1 h-3.5 w-3.5" />}
            Save
          </Button>

          {form?.status !== 'active' ? (
            <Button size="sm" onClick={handleGoLive} disabled={saving || guide.questions.length === 0}>
              <Rocket className="mr-1 h-3.5 w-3.5" />
              Go Live
            </Button>
          ) : (
            <Button size="sm" variant="secondary" disabled>
              <Check className="mr-1 h-3.5 w-3.5" /> Live
            </Button>
          )}
        </div>
      </header>

      {/* Go Live: we navigate to Share tab; banner only on standalone /form/new/build */}
      {goLiveSuccess && shareUrl && !workspaceContent && (
        <div className="flex items-center gap-3 border-b bg-green-50 px-4 py-2.5">
          <Check className="h-4 w-4 text-green-600" />
          <span className="text-sm font-medium text-green-800">Your AI form is live! Open Share to copy the link.</span>
          <button type="button" onClick={() => setGoLiveSuccess(false)} className="text-sm text-green-700 hover:text-green-900">
            ✕
          </button>
        </div>
      )}

      {error && (
        <div className="border-b bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {error}
          <button onClick={() => setError(null)} className="ml-2 underline">dismiss</button>
        </div>
      )}

      {/* Content tab: 3-panel builder */}
      {activeTab === 'content' && (
        <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
          {/* Left sidebar — scroll only here */}
          <div className="flex min-h-0 w-56 shrink-0 flex-col overflow-hidden border-r bg-muted/30 lg:w-64">
            <QuestionList
              questions={guide.questions}
              selectedIndex={selectedQuestion}
              onSelect={setSelectedQuestion}
              onReorder={handleReorder}
              onDelete={handleDelete}
              onAddClick={() => setPickerOpen(true)}
            />
          </div>

          {/* Center — editor scrolls; chat docked bottom (always visible) */}
          <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            <div className="min-h-0 min-w-0 flex-1 overflow-y-auto">
              {currentQ ? (
                <QuestionContentEditor
                  question={currentQ}
                  questionNumber={selectedQuestion + 1}
                  onChange={updateQuestion}
                />
              ) : (
                <div className="flex min-h-[12rem] flex-col items-center justify-center px-8 py-16 text-muted-foreground">
                  <div className="text-center">
                    <p className="text-sm">No questions yet.</p>
                    <Button
                      variant="outline"
                      className="mt-3"
                      onClick={() => setPickerOpen(true)}
                    >
                      Add your first question
                    </Button>
                  </div>
                </div>
              )}
            </div>
            <ChatToCreateTeaser />
          </div>

          {/* Right panel — scroll only here */}
          <div className="flex min-h-0 min-w-0 w-64 shrink-0 flex-col overflow-hidden border-l bg-muted/30 lg:w-72">
            {currentQ ? (
              <QuestionSettings
                question={currentQ}
                onChange={updateQuestion}
                storageFolder={assetStorageFolder}
              />
            ) : (
              <div className="flex h-full items-center justify-center p-4 text-center text-sm text-muted-foreground">
                Select a question to see settings
              </div>
            )}
          </div>
        </div>
      )}

      {/* Design tab */}
      {activeTab === 'design' && (
        <div className="flex flex-1 items-start justify-center overflow-y-auto p-8">
          <div className="w-full max-w-md space-y-5">
            <h2 className="text-lg font-semibold">Branding</h2>
            <div>
              <label className="text-sm font-medium">Company name</label>
              <input
                value={companyName}
                onChange={e => setCompanyName(e.target.value)}
                placeholder="e.g., Google"
                className="mt-1 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Primary color</label>
              <div className="mt-1 flex items-center gap-2">
                <input
                  type="color"
                  value={primaryColor || '#6366f1'}
                  onChange={e => setPrimaryColor(e.target.value)}
                  className="h-9 w-9 cursor-pointer rounded border"
                />
                <input
                  value={primaryColor}
                  onChange={e => setPrimaryColor(e.target.value)}
                  placeholder="#6366f1"
                  className="flex-1 rounded-md border border-input bg-transparent px-3 py-2 text-sm"
                />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">Welcome message</label>
              <textarea
                value={welcomeMessage}
                onChange={e => setWelcomeMessage(e.target.value)}
                rows={3}
                placeholder="Hi! Thanks for taking a few minutes..."
                className="mt-1 w-full resize-none rounded-md border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <p className="mt-1.5 text-xs text-muted-foreground">
                Leave blank to use the default intro (matches AI form language and estimated
                duration).
              </p>
            </div>
            <div>
              <label className="flex items-center gap-2 text-sm font-medium">
                <ImageIcon className="h-4 w-4 text-muted-foreground" aria-hidden />
                Welcome image (optional)
              </label>
              <input
                ref={welcomeImageFileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp,image/avif"
                className="sr-only"
                onChange={handleWelcomeImageFile}
              />
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={welcomeImageUploading}
                  onClick={() => welcomeImageFileInputRef.current?.click()}
                >
                  {welcomeImageUploading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Uploading…
                    </>
                  ) : (
                    <>
                      <Upload className="mr-2 h-4 w-4" />
                      Upload from computer
                    </>
                  )}
                </Button>
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">
                JPEG, PNG, GIF, WebP, or AVIF — max 5 MB. Shown above the AI form title on the
                welcome screen (stored in your Supabase project when you upload).
              </p>
              {welcomeImageUploadError && (
                <p className="mt-2 text-xs text-destructive">{welcomeImageUploadError}</p>
              )}
              <label className="mt-4 block text-xs font-medium text-muted-foreground">
                Or paste image URL
              </label>
              <input
                type="url"
                value={welcomeImageUrl}
                onChange={e => {
                  setWelcomeImageUploadError(null)
                  setWelcomeImageUrl(e.target.value)
                }}
                placeholder="https://example.com/your-banner.jpg"
                className="mt-1 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
              {welcomeImageUrl.trim() && (
                <div className="mt-3 space-y-2">
                  <img
                    src={welcomeImageUrl.trim()}
                    alt=""
                    className="max-h-40 w-full max-w-full rounded-lg border border-border object-contain"
                    onError={ev => {
                      ev.currentTarget.style.display = 'none'
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setWelcomeImageUrl('')
                      setWelcomeImageUploadError(null)
                    }}
                  >
                    Remove image
                  </Button>
                </div>
              )}
            </div>
            <div>
              <label className="text-sm font-medium">Thank you message</label>
              <textarea
                value={thankYouMessage}
                onChange={e => setThankYouMessage(e.target.value)}
                rows={2}
                className="mt-1 w-full resize-none rounded-md border border-input bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          </div>
        </div>
      )}

      {/* Settings tab */}
      {activeTab === 'settings' && (
        <div className="flex flex-1 items-start justify-center overflow-y-auto p-8">
          <div className="w-full max-w-md space-y-5">
            <h2 className="text-lg font-semibold">AI Form Settings</h2>
            <div>
              <label className="text-sm font-medium">Language</label>
              <select
                value={language}
                onChange={e => setLanguage(e.target.value as 'en' | 'id')}
                className="mt-1 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="en">English</option>
                <option value="id">Bahasa Indonesia</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium">Max responses (optional)</label>
              <input
                type="number"
                value={maxResponses}
                onChange={e => setMaxResponses(e.target.value)}
                placeholder="Unlimited"
                className="mt-1 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Redirect URL (optional)</label>
              <input
                value={redirectUrl}
                onChange={e => setRedirectUrl(e.target.value)}
                placeholder="https://..."
                className="mt-1 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Objective</label>
              <textarea
                value={objective}
                onChange={e => setObjective(e.target.value)}
                rows={2}
                className="mt-1 w-full resize-none rounded-md border border-input bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <div>
              <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  checked={readAloudDefaultEnabled}
                  onChange={e => setReadAloudDefaultEnabled(e.currentTarget.checked)}
                  className="h-4 w-4 rounded border-input accent-primary"
                />
                Enable AI Read aloud by default
              </label>
              <p className="mt-1 text-xs text-muted-foreground">
                If enabled, respondents start with AI Read aloud checked on first load.
              </p>
            </div>
            {form?.share_slug && (
              <div>
                <label className="text-sm font-medium">Share link</label>
                <div className="mt-1 flex gap-2">
                  <input
                    readOnly
                    value={shareUrl}
                    className="flex-1 rounded-md border bg-muted/50 px-3 py-2 text-sm"
                  />
                  <Button size="sm" variant="outline" onClick={handleCopy}>
                    {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            )}
            {form && form.status === 'active' && (
              <Button
                variant="outline"
                onClick={async () => {
                  await updateFormStatus(form.id, 'paused')
                  setForm(prev => prev ? { ...prev, status: 'paused' } : null)
                }}
              >
                Pause AI form
              </Button>
            )}
          </div>
        </div>
      )}

      <ElementPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onAdd={handleAddQuestion}
      />
    </div>
  )
}
