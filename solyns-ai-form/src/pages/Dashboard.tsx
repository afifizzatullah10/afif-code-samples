import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { DashboardFormCard } from '@/components/dashboard/DashboardFormCard'
import { deleteForm, fetchForms, adminCheckAccess } from '@/lib/api'
import type { FormWithResponseCount } from '@/lib/types'
import { useAuth } from '@/hooks/useAuth'
import {
  LayoutGrid,
  List,
  Loader2,
  LogOut,
  Shield,
  Plus,
  Search,
  FileQuestion,
} from 'lucide-react'
import { cn } from '@/lib/utils'

type SortKey = 'created' | 'updated' | 'alpha'
type ViewMode = 'grid' | 'list'

export default function Dashboard() {
  const navigate = useNavigate()
  const { signOut } = useAuth()
  const [forms, setForms] = useState<FormWithResponseCount[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState<SortKey>('created')
  const [view, setView] = useState<ViewMode>('list')
  const [isAdmin, setIsAdmin] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchForms()
      setForms(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load forms')
    } finally {
      setLoading(false)
    }
  }, [])

  const refresh = useCallback(async () => {
    try {
      const data = await fetchForms()
      setForms(data)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load forms')
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const checkAdminStatus = async () => {
      try {
        const result = await adminCheckAccess()
        setIsAdmin(result.is_admin)
      } catch {
        // If check fails, default to non-admin (safer default)
        setIsAdmin(false)
      }
    }
    void checkAdminStatus()
  }, [])

  const displayed = useMemo(() => {
    const q = search.trim().toLowerCase()
    let list = forms
    if (q) {
      list = forms.filter(
        f =>
          f.title.toLowerCase().includes(q) ||
          f.objective.toLowerCase().includes(q)
      )
    }
    const sorted = [...list].sort((a, b) => {
      if (sortBy === 'alpha') {
        return (a.title || '').localeCompare(b.title || '', undefined, {
          sensitivity: 'base',
        })
      }
      if (sortBy === 'updated') {
        return (
          new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
        )
      }
      return (
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )
    })
    return sorted
  }, [forms, search, sortBy])

  const totalResponses = useMemo(
    () => forms.reduce((sum, f) => sum + f.response_count, 0),
    [forms]
  )

  const handleSignOut = async () => {
    await signOut()
    navigate('/login')
  }

  return (
    <div className="flex min-h-screen flex-col bg-muted/40 md:flex-row md:overflow-hidden">
      <aside className="flex w-full shrink-0 flex-col border-border bg-background md:sticky md:top-0 md:h-screen md:w-60 md:border-r">
        <div className="border-b border-border p-4">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="mb-4 border-l-2 border-gold pl-3 text-left text-sm font-semibold tracking-tight text-foreground hover:opacity-80"
          >
            Solyns AI Form
          </button>
          <Button
            className="w-full rounded-lg bg-foreground font-medium text-primary-foreground hover:bg-foreground/90"
            onClick={() => navigate('/form/new')}
          >
            <Plus className="mr-2 h-4 w-4" />
            Create AI Form
          </Button>
          <div className="relative mt-4">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              placeholder="Search"
              value={search}
              onChange={e => setSearch(e.currentTarget.value)}
              className="flex h-10 w-full rounded-lg border border-border bg-muted/50 px-3 py-2 pl-9 text-sm text-foreground shadow-sm outline-none ring-offset-background placeholder:text-muted-foreground/80 focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
        </div>

        <div className="mt-auto border-t border-border p-4">
          <p className="text-xs font-medium text-foreground">Overview</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {totalResponses}{' '}
            {totalResponses === 1 ? 'response' : 'responses'} · {forms.length}{' '}
            {forms.length === 1 ? 'AI Form' : 'AI Forms'}
          </p>
          {isAdmin && (
            <Button
              variant="ghost"
              size="sm"
              className="mt-3 w-full justify-start px-2 text-muted-foreground hover:text-foreground"
              onClick={() => navigate('/admin')}
            >
              <Shield className="mr-2 h-4 w-4" />
              Admin console
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className={cn('w-full justify-start px-2 text-muted-foreground hover:text-foreground', isAdmin && 'mt-1')}
            onClick={() => void handleSignOut()}
          >
            <LogOut className="mr-2 h-4 w-4" />
            Log out
          </Button>
        </div>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col md:overflow-hidden">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-background px-5 py-4">
          <h1 className="text-lg font-semibold tracking-tight text-foreground">
            AI Forms
          </h1>
          <div className="flex flex-wrap items-center gap-2">
            <label className="sr-only" htmlFor="dashboard-sort">
              Sort AI forms
            </label>
            <select
              id="dashboard-sort"
              value={sortBy}
              onChange={e => setSortBy(e.target.value as SortKey)}
              className="h-9 rounded-md border border-border bg-background px-3 text-sm text-foreground shadow-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="created">Date created</option>
              <option value="updated">Last updated</option>
              <option value="alpha">Alphabetical</option>
            </select>
            <div className="flex rounded-md border border-border bg-muted/60 p-0.5">
              <button
                type="button"
                aria-pressed={view === 'list'}
                onClick={() => setView('list')}
                className={cn(
                  'rounded p-1.5 text-muted-foreground transition-colors',
                  view === 'list' &&
                    'bg-background text-foreground shadow-sm ring-1 ring-gold/25'
                )}
                aria-label="List view"
              >
                <List className="h-4 w-4" />
              </button>
              <button
                type="button"
                aria-pressed={view === 'grid'}
                onClick={() => setView('grid')}
                className={cn(
                  'rounded p-1.5 text-muted-foreground transition-colors',
                  view === 'grid' &&
                    'bg-background text-foreground shadow-sm ring-1 ring-gold/25'
                )}
                aria-label="Grid view"
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-auto p-5 md:p-6">
          {loading && (
            <div className="flex justify-center py-24">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-center text-sm text-destructive">
              {error}
            </div>
          )}

          {!loading && !error && forms.length === 0 && (
            <div className="mx-auto flex max-w-md flex-col items-center justify-center rounded-xl border border-dashed border-border bg-background py-20">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gold/10">
                <FileQuestion className="h-8 w-8 text-gold-dark" />
              </div>
              <h2 className="mb-2 text-lg font-semibold text-foreground">
                No AI forms yet
              </h2>
              <p className="mb-6 max-w-sm px-6 text-center text-sm text-muted-foreground">
                Create your first conversational AI form. Describe what you want to
                learn, and AI will draft your discussion guide.
              </p>
              <Button
                className="rounded-lg bg-foreground text-primary-foreground hover:bg-foreground/90"
                onClick={() => navigate('/form/new')}
              >
                <Plus className="mr-2 h-4 w-4" />
                Create your first AI form
              </Button>
            </div>
          )}

          {!loading &&
            !error &&
            forms.length > 0 &&
            displayed.length === 0 && (
              <p className="py-16 text-center text-sm text-muted-foreground">
                No AI forms match your search.
              </p>
            )}

          {!loading && !error && displayed.length > 0 && view === 'grid' && (
            <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {displayed.map(form => (
                <DashboardFormCard
                  key={form.id}
                  form={form}
                  layout="grid"
                  onDelete={deleteForm}
                  onDeleted={() => void refresh()}
                />
              ))}
            </div>
          )}

          {!loading && !error && displayed.length > 0 && view === 'list' && (
            <div className="overflow-hidden rounded-xl border border-border bg-background shadow-sm">
              {displayed.map(form => (
                <DashboardFormCard
                  key={form.id}
                  form={form}
                  layout="list"
                  onDelete={deleteForm}
                  onDeleted={() => void refresh()}
                />
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
