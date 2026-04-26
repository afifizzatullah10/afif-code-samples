import { useEffect, useState, useRef, memo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { Reveal } from '@/components/landing/Reveal'
import { Button } from '@/components/ui/button'
import {
  Sparkles,
  BarChart3,
  Share2,
  Zap,
  MessageSquare,
  Brain,
  Mic,
  Shield,
  ArrowRight,
  Check,
  Menu,
  X,
  Play,
} from 'lucide-react'

/**
 * Product demo (YouTube embed). Watch URL https://www.youtube.com/watch?v=V_m3y6OX9XE
 */
const DEMO_VIDEO_EMBED_URL = 'https://www.youtube.com/embed/V_m3y6OX9XE'

function SolynsLogo({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      className={className}
      aria-hidden
    >
      <rect x="2" y="4" width="28" height="20" rx="4" fill="currentColor" />
      <path d="M10 28l4-4h-8l4 4z" fill="currentColor" />
      <circle cx="10" cy="14" r="1.5" fill="#fff" />
      <circle cx="16" cy="14" r="1.5" fill="#fff" />
      <circle cx="22" cy="14" r="1.5" fill="#fff" />
    </svg>
  )
}

/** Stroke-only mark (matches Lucide outline icons in the proof strip). */
function SolynsLogoOutline({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" className={className} aria-hidden>
      <rect
        x="2.75"
        y="4.75"
        width="26.5"
        height="18.5"
        rx="3.5"
        stroke="currentColor"
        strokeWidth="1.75"
      />
      <path
        d="M10 28l4-4h-8l4 4z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <circle cx="10" cy="14" r="1.35" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="16" cy="14" r="1.35" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="22" cy="14" r="1.35" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}

/** Hero pill cycles these lines; outer min width follows the shortest line. */
const HERO_PILL_LINES = [
  'AI-Powered Forms That Think',
  'AI-Powered Forms That Talk Back',
  'AI-Powered Forms That Learn',
  'AI-Powered Forms That Deep Dive',
  'AI-Powered Forms That Know Better',
] as const

const HERO_PILL_LAYOUT_LINE = [...HERO_PILL_LINES].sort(
  (a, b) => a.length - b.length
)[0]

/** Stable mount; does not re-render when the typewriter next door updates (avoids SVG flicker). */
const HeroPillSparkles = memo(function HeroPillSparkles() {
  return (
    <span
      aria-hidden
      className="pointer-events-none inline-flex shrink-0 text-gold-dark [transform:translateZ(0)]"
    >
      <Sparkles className="h-3.5 w-3.5" />
    </span>
  )
})

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms)
  })
}

/** Steady pill; typing animation loops for motion users only. */
function HeroPillTagline() {
  const [text, setText] = useState(() =>
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
      ? HERO_PILL_LINES[0]
      : ''
  )
  const [reducedMotion, setReducedMotion] = useState(() =>
    typeof window !== 'undefined'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false
  )

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const sync = () => setReducedMotion(mq.matches)
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])

  useEffect(() => {
    if (reducedMotion) {
      setText(HERO_PILL_LINES[0])
      return
    }

    let cancelled = false
    const typeMs = 48
    const deleteMs = 32
    const pauseTyped = 2200
    const pauseEmpty = 400
    let lineIndex = 0

    ;(async () => {
      while (!cancelled) {
        const line = HERO_PILL_LINES[lineIndex]
        for (let j = 1; j <= line.length; j++) {
          if (cancelled) return
          await sleep(typeMs)
          setText(line.slice(0, j))
        }
        await sleep(pauseTyped)
        for (let j = line.length - 1; j >= 0; j--) {
          if (cancelled) return
          await sleep(deleteMs)
          setText(line.slice(0, j))
        }
        await sleep(pauseEmpty)
        lineIndex = (lineIndex + 1) % HERO_PILL_LINES.length
      }
    })()

    return () => {
      cancelled = true
    }
  }, [reducedMotion])

  return (
    <>
      <span className="sr-only">
        Rotating messages: {HERO_PILL_LINES.join('. ')}.
      </span>
      <span className="inline-grid">
        <span className="col-start-1 row-start-1 invisible select-none" aria-hidden>
          {HERO_PILL_LAYOUT_LINE}
        </span>
        <span className="col-start-1 row-start-1 isolate whitespace-nowrap text-left [contain:paint]" aria-hidden>
          {text}
          {!reducedMotion ? (
            <span
              className="typewriter-caret ml-px inline-block h-[1.15em] w-px translate-y-[0.08em] bg-current align-middle"
              aria-hidden
            />
          ) : null}
        </span>
      </span>
    </>
  )
}

export default function Landing() {
  const { user, loading } = useAuth()
  const navigate = useNavigate()
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    if (!loading && user) {
      navigate('/dashboard', { replace: true })
    }
  }, [user, loading, navigate])

  const scrollTo = (id: string) => {
    setMobileOpen(false)
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <div className="min-h-screen bg-white text-foreground antialiased">
      {/* ─── HEADER ─── */}
      <header className="sticky top-0 z-50 border-b border-border/60 bg-white/80 backdrop-blur-lg motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-1 motion-safe:duration-500">
        <div className="container flex h-16 items-center justify-between">
          <button
            onClick={() => scrollTo('hero')}
            className="flex items-center gap-2.5 text-lg font-semibold tracking-tight"
          >
            <SolynsLogo className="h-6 w-6 text-gold" />
            Solyns Form
          </button>

          {/* Desktop nav */}
          <nav className="hidden items-center gap-8 text-sm md:flex">
            <button onClick={() => scrollTo('features')} className="text-muted-foreground transition-colors duration-300 hover:text-foreground">Features</button>
            <button onClick={() => scrollTo('demo')} className="text-muted-foreground transition-colors duration-300 hover:text-foreground">Demo</button>
            <button onClick={() => scrollTo('how-it-works')} className="text-muted-foreground transition-colors duration-300 hover:text-foreground">How It Works</button>
            <button onClick={() => scrollTo('pricing')} className="text-muted-foreground transition-colors duration-300 hover:text-foreground">Pricing</button>
          </nav>

          <div className="hidden items-center gap-3 md:flex">
            <Button variant="ghost" size="sm" onClick={() => navigate('/login')}>
              Sign in
            </Button>
            <Button size="sm" onClick={() => scrollTo('waitlist')} className="bg-foreground text-white hover:bg-foreground/90">
              Join Waitlist
            </Button>
          </div>

          {/* Mobile hamburger */}
          <button className="md:hidden" onClick={() => setMobileOpen(!mobileOpen)} aria-label="Menu">
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        {/* Mobile menu */}
        {mobileOpen && (
          <div className="border-t bg-white px-6 py-4 md:hidden">
            <nav className="flex flex-col gap-4 text-sm">
              <button onClick={() => scrollTo('features')} className="text-left text-muted-foreground hover:text-foreground">Features</button>
              <button onClick={() => scrollTo('demo')} className="text-left text-muted-foreground hover:text-foreground">Demo</button>
              <button onClick={() => scrollTo('how-it-works')} className="text-left text-muted-foreground hover:text-foreground">How It Works</button>
              <button onClick={() => scrollTo('pricing')} className="text-left text-muted-foreground hover:text-foreground">Pricing</button>
              <hr className="border-border" />
              <Button variant="ghost" size="sm" onClick={() => { setMobileOpen(false); navigate('/login') }}>Sign in</Button>
              <Button size="sm" onClick={() => scrollTo('waitlist')} className="bg-foreground text-white hover:bg-foreground/90">Join Waitlist</Button>
            </nav>
          </div>
        )}
      </header>

      {/* ─── HERO ─── */}
      <section id="hero" className="relative overflow-x-hidden">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,hsl(43_74%_49%/0.08),transparent)]" />
        <div className="container flex flex-col items-center py-24 text-center md:py-36 lg:py-44">
          <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-gold/20 bg-gold/5 px-4 py-1.5 text-sm font-medium text-gold-dark motion-safe:animate-in motion-safe:fade-in motion-safe:duration-500">
            <HeroPillSparkles />
            <HeroPillTagline />
          </div>
          <h1 className="mx-auto max-w-4xl text-4xl font-bold leading-tight tracking-tight motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-3 motion-safe:duration-700 motion-safe:fill-mode-both motion-safe:delay-100 motion-reduce:translate-y-0 motion-reduce:opacity-100 md:text-6xl md:leading-[1.08] lg:text-7xl lg:leading-[1.06]">
            <span className="text-foreground">Build forms that</span>
            <br />
            {/* Inline gradient + isolate avoids Chrome fringing / “white” letter edges on bg-clip-text */}
            <span
              className="isolate inline-block bg-clip-text pb-0.5 antialiased [transform:translate3d(0,0,0)]"
              style={{
                backgroundImage:
                  'linear-gradient(90deg, hsl(43 74% 32%) 0%, hsl(43 74% 48%) 50%, hsl(43 74% 32%) 100%)',
                WebkitBackgroundClip: 'text',
                backgroundClip: 'text',
                color: 'transparent',
                WebkitTextFillColor: 'transparent',
              }}
            >
              listen, adapt, and learn
            </span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-3 motion-safe:duration-700 motion-safe:fill-mode-both motion-safe:delay-200 motion-reduce:translate-y-0 motion-reduce:opacity-100 md:text-xl">
            Solyns Form generates intelligent forms that ask the right follow-up questions,
            adapt in real time, and distill hundreds of responses into
            executive-ready insights — automatically.
          </p>
          <div className="mt-10 flex flex-col gap-3 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-3 motion-safe:duration-700 motion-safe:fill-mode-both motion-safe:delay-300 motion-reduce:translate-y-0 motion-reduce:opacity-100 sm:flex-row">
            <Button
              size="lg"
              onClick={() => scrollTo('waitlist')}
              className="gap-2 bg-foreground px-8 text-white hover:bg-foreground/90"
            >
              Get Early Access <ArrowRight className="h-4 w-4" />
            </Button>
            <Button size="lg" variant="outline" onClick={() => scrollTo('demo')} className="gap-2">
              Watch demo <Play className="h-4 w-4" />
            </Button>
          </div>
          <p className="mt-4 text-xs text-muted-foreground motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-700 motion-safe:fill-mode-both motion-safe:delay-500 motion-reduce:translate-y-0 motion-reduce:opacity-100">
            Free during beta &middot; No credit card required
          </p>
        </div>
      </section>

      {/* ─── SOCIAL PROOF ─── */}
      <section className="border-y border-border/60 bg-muted/30">
        <div className="container py-6">
          <Reveal>
          <div className="flex flex-wrap items-center justify-center gap-x-12 gap-y-4 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <SolynsLogoOutline className="h-3.5 w-3.5 shrink-0 text-gold" />
              Built for researchers, PMs, and founders
            </span>
            <span className="hidden h-4 w-px bg-border sm:block" />
            <span className="flex items-center gap-1.5"><Zap className="h-3.5 w-3.5 text-gold" /> Scalable depth your surveys can't reach</span>
            <span className="hidden h-4 w-px bg-border sm:block" />
            <span className="flex items-center gap-1.5"><Shield className="h-3.5 w-3.5 text-gold" /> Enterprise-grade privacy</span>
          </div>
          </Reveal>

          {/* CMU / Swartz — directly under hero proof strip */}
          <Reveal delayMs={90} className="block">
          <div className="mx-auto mt-8 max-w-lg border-t border-border/60 pt-8">
            <p className="text-center text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Built at
            </p>
            <a
              href="https://www.cmu.edu/"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 flex justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2"
            >
              <img
                src="/cmu-wordmark-bw.svg"
                alt="Carnegie Mellon University"
                className="h-6 w-auto max-w-[min(100%,20rem)] opacity-[0.92]"
                width={178}
                height={16}
              />
            </a>
            <p className="mt-4 text-center text-xs leading-relaxed text-muted-foreground">
              In collaboration with the{' '}
              <a
                href="https://www.cmu.edu/swartz-center-for-entrepreneurship/"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-foreground underline decoration-border underline-offset-2 transition-colors hover:text-gold-dark hover:decoration-gold/50"
              >
                Swartz Center for Entrepreneurship
              </a>
              .
            </p>
          </div>
          </Reveal>
        </div>
      </section>

      {/* ─── FEATURES ─── */}
      <section id="features" className="py-24 md:py-32">
        <div className="container">
          <Reveal>
          <div className="mx-auto max-w-2xl text-center">
            <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-gold">Features</p>
            <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
              Everything you need to understand your customers
            </h2>
            <p className="mt-4 text-muted-foreground">
              From form creation to insight delivery — all powered by AI.
            </p>
          </div>
          </Reveal>

          <div className="mx-auto mt-16 grid max-w-5xl gap-8 md:grid-cols-2 lg:grid-cols-3">
            {[
              {
                icon: <Sparkles className="h-5 w-5" />,
                title: 'AI Form Generation',
                desc: 'Describe your research goal. Solyns Form designs the perfect discussion guide with optimal question types and flow.',
              },
              {
                icon: <Brain className="h-5 w-5" />,
                title: 'Smart Follow-Ups',
                desc: 'Our AI interviewer probes deeper when answers are vague — just like a senior researcher would.',
              },
              {
                icon: <Mic className="h-5 w-5" />,
                title: 'Voice & Text Input',
                desc: 'Respondents answer via text or voice in a clean, mobile-first experience. No app download needed.',
              },
              {
                icon: <BarChart3 className="h-5 w-5" />,
                title: 'Instant Insights',
                desc: 'AI synthesizes all responses into themes, key quotes, and actionable recommendations.',
              },
              {
                icon: <Share2 className="h-5 w-5" />,
                title: 'One-Link Distribution',
                desc: 'Share a single link via email, Slack, or social. Beautiful on any device, zero friction.',
              },
              {
                icon: <MessageSquare className="h-5 w-5" />,
                title: 'Conversational UX',
                desc: 'Typeform-style one-question-at-a-time flow keeps completion rates high.',
              },
            ].map((f, i) => (
              <Reveal key={f.title} delayMs={i * 65}>
              <div className="group rounded-xl border border-border/60 bg-white p-6 transition-all duration-500 hover:border-gold/30 hover:shadow-lg hover:shadow-gold/5">
                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-gold/10 text-gold transition-colors duration-500 group-hover:bg-gold group-hover:text-white">
                  {f.icon}
                </div>
                <h3 className="mb-2 font-semibold">{f.title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{f.desc}</p>
              </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ─── VIDEO DEMO (set DEMO_VIDEO_EMBED_URL at top of file) ─── */}
      <section id="demo" className="border-t border-border/60 bg-muted/20 py-16 md:py-24">
        <div className="container">
          <Reveal>
          <div className="mx-auto max-w-3xl text-center">
            <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-gold">Demo</p>
            <h2 className="text-2xl font-bold tracking-tight md:text-3xl">See Solyns Form in action</h2>
            <p className="mt-3 text-muted-foreground">
              A quick walkthrough of building and running an AI-powered form.
            </p>
          </div>
          </Reveal>
          <Reveal delayMs={100} className="block">
          <div className="mx-auto mt-10 max-w-4xl overflow-hidden rounded-xl border border-border/60 bg-black/5 shadow-lg shadow-black/5 transition-shadow duration-700 hover:shadow-xl hover:shadow-black/[0.06]">
            {DEMO_VIDEO_EMBED_URL ? (
              <div className="aspect-video w-full">
                <iframe
                  title="Solyns Form product demo"
                  src={DEMO_VIDEO_EMBED_URL}
                  className="h-full w-full"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                />
              </div>
            ) : (
              <div className="flex aspect-video w-full flex-col items-center justify-center gap-4 bg-muted/40 px-6 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-full border border-border bg-background/80 text-muted-foreground">
                  <Play className="h-7 w-7" aria-hidden />
                </div>
                <div>
                  <p className="font-medium text-foreground">Video demo coming soon</p>
                  <p className="mt-1 max-w-md text-sm text-muted-foreground">
                    We&apos;ll drop the YouTube embed here — one constant at the top of this file
                    (<code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">DEMO_VIDEO_EMBED_URL</code>).
                  </p>
                </div>
              </div>
            )}
          </div>
          </Reveal>
        </div>
      </section>

      {/* ─── HOW IT WORKS ─── */}
      <section id="how-it-works" className="border-y border-border/60 bg-muted/20 py-24 md:py-32">
        <div className="container">
          <Reveal>
          <div className="mx-auto max-w-2xl text-center">
            <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-gold">How It Works</p>
            <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
              From question to insight in three steps
            </h2>
          </div>
          </Reveal>

          <div className="mx-auto mt-16 grid max-w-4xl gap-12 md:grid-cols-3">
            {[
              {
                step: '01',
                title: 'Describe your goal',
                desc: 'Tell Solyns Form what you want to learn. AI generates a tailored form with smart question types, branching logic, and follow-up probes.',
              },
              {
                step: '02',
                title: 'Share a link',
                desc: 'Send a clean, branded link to your audience. Respondents answer naturally via text or voice — 3 minutes, any device.',
              },
              {
                step: '03',
                title: 'Get insights',
                desc: 'AI analyzes every response and delivers themes, sentiment, quotes, and recommendations — ready for your next decision.',
              },
            ].map((s, i) => (
              <Reveal key={s.step} delayMs={i * 90}>
              <div className="text-center">
                <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-foreground text-xl font-bold text-white shadow-sm transition-transform duration-500 motion-safe:hover:scale-[1.03]">
                  {s.step}
                </div>
                <h3 className="mb-2 text-lg font-semibold">{s.title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{s.desc}</p>
              </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ─── PRICING ─── */}
      <section id="pricing" className="py-24 md:py-32">
        <div className="container">
          <Reveal>
          <div className="mx-auto max-w-2xl text-center">
            <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-gold">Pricing</p>
            <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
              Simple, transparent pricing
            </h2>
            <p className="mt-4 text-muted-foreground">
              Start free. Upgrade when you need more.
            </p>
          </div>
          </Reveal>

          <div className="mx-auto mt-16 grid max-w-4xl gap-8 md:grid-cols-3">
            {/* Free */}
            <Reveal>
            <div className="flex flex-col rounded-xl border border-border/60 bg-white p-8 transition-shadow duration-500 hover:shadow-md">
              <h3 className="text-lg font-semibold">Starter</h3>
              <p className="mt-1 text-sm text-muted-foreground">Perfect for trying Solyns Form</p>
              <div className="mt-6">
                <span className="text-4xl font-bold">$0</span>
                <span className="text-muted-foreground">/mo</span>
              </div>
              <ul className="mt-8 flex-1 space-y-3 text-sm">
                {['3 forms', '25 responses/form', 'AI form generation', 'AI follow-ups', 'Basic insights'].map(f => (
                  <li key={f} className="flex items-start gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-gold" /> {f}
                  </li>
                ))}
              </ul>
              <Button variant="outline" className="mt-8 w-full" onClick={() => scrollTo('waitlist')}>
                Join Waitlist
              </Button>
            </div>
            </Reveal>

            {/* Pro */}
            <Reveal delayMs={70}>
            <div className="relative flex flex-col rounded-xl border-2 border-foreground bg-white p-8 shadow-xl transition-shadow duration-500 hover:shadow-xl">
              <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 rounded-full bg-foreground px-4 py-1 text-xs font-semibold text-white">
                Most Popular
              </div>
              <h3 className="text-lg font-semibold">Pro</h3>
              <p className="mt-1 text-sm text-muted-foreground">For teams who run research regularly</p>
              <div className="mt-6">
                <span className="text-4xl font-bold">$25</span>
                <span className="text-muted-foreground">/mo</span>
              </div>
              <ul className="mt-8 flex-1 space-y-3 text-sm">
                {['Unlimited forms', 'Unlimited responses', 'Advanced AI insights', 'Custom branding', 'CSV & Excel export', 'Voice input', 'Priority support'].map(f => (
                  <li key={f} className="flex items-start gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-gold" /> {f}
                  </li>
                ))}
              </ul>
              <Button className="mt-8 w-full bg-foreground text-white hover:bg-foreground/90" onClick={() => scrollTo('waitlist')}>
                Join Waitlist
              </Button>
            </div>
            </Reveal>

            {/* Enterprise */}
            <Reveal delayMs={140}>
            <div className="flex flex-col rounded-xl border border-border/60 bg-white p-8 transition-shadow duration-500 hover:shadow-md">
              <h3 className="text-lg font-semibold">Enterprise</h3>
              <p className="mt-1 text-sm text-muted-foreground">For organizations at scale</p>
              <div className="mt-6">
                <span className="text-4xl font-bold">Custom</span>
              </div>
              <ul className="mt-8 flex-1 space-y-3 text-sm">
                {['Everything in Pro', 'SSO & team management', 'Custom AI models', 'API access', 'Dedicated success manager', 'SLA & compliance'].map(f => (
                  <li key={f} className="flex items-start gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-gold" /> {f}
                  </li>
                ))}
              </ul>
              <Button variant="outline" className="mt-8 w-full" onClick={() => scrollTo('waitlist')}>
                Contact Us
              </Button>
            </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ─── WAITLIST CTA ─── */}
      <section id="waitlist" className="border-t border-border/60 bg-foreground py-24 text-white md:py-32">
        <div className="container">
          <Reveal>
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
              Be the first to try Solyns Form
            </h2>
            <p className="mt-4 text-white/60">
              We&apos;re launching soon. Join the waitlist and get early access — plus a lifetime discount for founding members.
            </p>
            <WaitlistForm />
          </div>
          </Reveal>
        </div>
      </section>

      {/* ─── FOOTER ─── */}
      <footer className="border-t border-border/60 bg-white">
        <Reveal>
        <div className="container flex flex-col items-center justify-between gap-6 py-10 md:flex-row">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <SolynsLogo className="h-5 w-5 text-gold" />
            Solyns Form
          </div>
          <nav className="flex flex-wrap justify-center gap-6 text-sm text-muted-foreground">
            <button onClick={() => scrollTo('features')} className="hover:text-foreground">Features</button>
            <button onClick={() => scrollTo('demo')} className="hover:text-foreground">Demo</button>
            <button onClick={() => scrollTo('how-it-works')} className="hover:text-foreground">How It Works</button>
            <button onClick={() => scrollTo('pricing')} className="hover:text-foreground">Pricing</button>
            <button onClick={() => navigate('/login')} className="hover:text-foreground">Sign In</button>
          </nav>
          <p className="text-xs text-muted-foreground">
            &copy; {new Date().getFullYear()} Solyns Form. All rights reserved.
          </p>
        </div>
        </Reveal>
      </footer>
    </div>
  )
}

/* ─── WAITLIST FORM COMPONENT ─── */

function WaitlistForm() {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = email.trim().toLowerCase()
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setErrorMsg('Please enter a valid email address.')
      setStatus('error')
      return
    }
    setStatus('loading')
    setErrorMsg('')

    const { error } = await supabase.from('waitlist').insert({ email: trimmed })

    if (error) {
      if (error.code === '23505') {
        setStatus('success')
        return
      }
      setErrorMsg('Something went wrong. Please try again.')
      setStatus('error')
      return
    }
    setStatus('success')
  }

  if (status === 'success') {
    return (
      <div className="mx-auto mt-8 flex items-center justify-center gap-2 rounded-full border border-gold/30 bg-gold/10 px-6 py-3 text-sm font-medium text-gold-light">
        <Check className="h-4 w-4" /> You&apos;re on the list! We&apos;ll be in touch soon.
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="mx-auto mt-8 flex max-w-md flex-col gap-3 sm:flex-row">
      <input
        ref={inputRef}
        type="email"
        value={email}
        onChange={e => { setEmail(e.target.value); setStatus('idle'); setErrorMsg('') }}
        placeholder="you@company.com"
        className="flex-1 rounded-lg border border-white/20 bg-white/10 px-4 py-3 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-gold"
        disabled={status === 'loading'}
      />
      <Button
        type="submit"
        disabled={status === 'loading'}
        className="whitespace-nowrap bg-gold px-6 text-foreground hover:bg-gold-light"
      >
        {status === 'loading' ? 'Joining...' : 'Join Waitlist'}
      </Button>
      {status === 'error' && errorMsg && (
        <p className="text-xs text-red-400 sm:absolute sm:mt-14">{errorMsg}</p>
      )}
    </form>
  )
}
