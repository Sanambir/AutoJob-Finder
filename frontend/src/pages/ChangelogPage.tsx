import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/auth'

interface Release {
  version: string
  date: string
  label?: 'latest' | 'beta' | 'major'
  sections: {
    type: 'new' | 'improved' | 'fixed' | 'removed'
    items: string[]
  }[]
}

const RELEASES: Release[] = [
  {
    version: '3.0.0',
    date: 'April 2026',
    label: 'latest',
    sections: [
      {
        type: 'new',
        items: [
          'Freemium tier system — Free (3 searches/day) and Premium (10 searches/day)',
          'Admin panel: tier toggle to upgrade/downgrade users between Free and Premium',
          'Usage counter on Search page showing searches used vs. daily limit',
          'Premium upgrade banner for free-tier users',
          'Tier badge (Free / Premium) visible on Profile page and Admin panel',
          'Onboarding flow on empty Feed — step-by-step guide for new users',
          'Privacy Policy page at /privacy covering data collection, storage, and your rights',
          'Support & FAQ page at /support with 10 common questions and contact cards',
          'Documentation page at /docs with pipeline guide, platform comparison, troubleshooting, and more',
          'Patch notes page at /changelog (this page)',
        ],
      },
      {
        type: 'fixed',
        items: [
          'Critical: cross-user data leak — User B could see User A\'s feed after a cache purge or deployment',
          'Tier upgrade not reflected in UI without a full page reload',
          'ConfigPage footer links pointing to broken targets (/api/docs and #)',
          'Cloudflare caching API responses by URL while ignoring auth cookies',
        ],
      },
      {
        type: 'improved',
        items: [
          'All API responses now include Cache-Control: no-store + Vary: Cookie headers to prevent Cloudflare caching user-specific data',
          'Auth store refreshes from /auth/me on every Search page mount to keep tier/usage data in sync',
          'Sidebar help icon links directly to /support',
        ],
      },
    ],
  },
  {
    version: '2.3.0',
    date: 'March 2026',
    sections: [
      {
        type: 'new',
        items: [
          'Resume A/B testing — upload multiple resumes and compare AI scores per job',
          'Auto-search scheduling — set a daily run time and keywords, pipeline runs automatically',
          'Analytics page with weekly activity chart, platform breakdown, and top scoring jobs',
          'Activity log — full history of searches, scoring events, and emails sent',
          'Admin panel: user list, job browser, system health check, activity feed',
        ],
      },
      {
        type: 'improved',
        items: [
          'Search results now stream via SSE — see jobs appear in real time instead of waiting for the full batch',
          'Pipeline runs scoring in parallel across all fetched jobs (faster throughput)',
          'Cover letter now references specific job requirements pulled from the description',
        ],
      },
    ],
  },
  {
    version: '2.2.0',
    date: 'February 2026',
    sections: [
      {
        type: 'new',
        items: [
          'Kanban board — drag-and-drop job pipeline across Discovered → Applied → Interview → Offer → Rejected',
          'Saved jobs — bookmark any job to review later, separate from the main feed',
          'Bulk actions in Feed: select multiple jobs and delete or re-queue in one click',
          'Feed filter pills — quickly filter by status (scored, emailed, error, below threshold)',
        ],
      },
      {
        type: 'improved',
        items: [
          'Job drawer redesigned with tabbed layout: Overview, Resume suggestions, Cover letter, Interview prep',
          'Match score now shown as a coloured ring (green ≥80, yellow ≥60, red <60)',
          'Missing skills list displayed as tags in the job drawer',
        ],
      },
    ],
  },
  {
    version: '2.1.0',
    date: 'January 2026',
    sections: [
      {
        type: 'new',
        items: [
          'Interview prep — AI-generated likely interview questions based on the job description and your resume',
          'Cover letter PDF download directly from the job drawer',
          'Retry button for jobs stuck in error state — re-queues them through the full pipeline',
          'Email notifications — receive a summary email when a high-match job is found',
        ],
      },
      {
        type: 'fixed',
        items: [
          'Pipeline would hang indefinitely on SMTP connection timeout — now fails fast with a clear error message',
          'PDF download using wrong argument order in generate_cover_letter_pdf()',
          'Jobs occasionally orphaned in "scoring" status after server restart — auto-reset to "error" on startup',
        ],
      },
    ],
  },
  {
    version: '2.0.0',
    date: 'December 2025',
    label: 'major',
    sections: [
      {
        type: 'new',
        items: [
          'Full frontend rewrite — React + TypeScript + Tailwind replacing the original single-file HTML app',
          'TanStack Query for server state, Zustand for auth — proper cache invalidation and optimistic updates',
          'Multi-resume management — upload PDF, DOCX, or TXT files and switch active resume at any time',
          'Forgot password / reset via 6-digit email code',
          'Email verification on registration',
          'Sidebar navigation replacing top-bar page switcher',
        ],
      },
      {
        type: 'improved',
        items: [
          'Auth now uses httpOnly cookie sessions instead of localStorage JWT tokens — more secure',
          'API responses validated with TypeScript interfaces end-to-end',
          'Dark-mode-only design system with consistent component library',
        ],
      },
    ],
  },
  {
    version: '1.2.0',
    date: 'November 2025',
    sections: [
      {
        type: 'new',
        items: [
          'Match threshold setting — only process jobs that score above your chosen percentage',
          'Below-threshold jobs are stored but skipped for tailoring/emailing to save AI credits',
          'Config page: adjust threshold, SMTP settings, and schedule from the UI',
        ],
      },
      {
        type: 'improved',
        items: [
          'Gemini API calls wrapped with exponential-backoff retry to handle rate limit bursts',
          'Score reasoning now stored per job and shown in the drawer',
        ],
      },
    ],
  },
  {
    version: '1.1.0',
    date: 'October 2025',
    sections: [
      {
        type: 'new',
        items: [
          'AI resume tailoring — Gemini rewrites your resume bullets to match each job description',
          'Cover letter generation — one-click cover letter personalised to the job and your background',
          'Multi-platform search: LinkedIn, Indeed, Glassdoor, ZipRecruiter, Google Jobs',
          'Dashboard stats: total jobs, emailed count, average match score, 7-day trend',
        ],
      },
    ],
  },
  {
    version: '1.0.0',
    date: 'September 2025',
    label: 'major',
    sections: [
      {
        type: 'new',
        items: [
          'Initial release — WorkfinderX (then named ResumeFlow AI)',
          'Job search via jobspy across Indeed and LinkedIn',
          'AI scoring with Google Gemini — match score 0–100% with reasoning and missing skills',
          'Automated pipeline: search → score → email notification',
          'User accounts with email/password auth',
          'Resume upload and storage',
        ],
      },
    ],
  },
]

const TYPE_META = {
  new:      { label: 'New',      color: 'bg-emerald-950/50 text-emerald-400 border border-emerald-700/30',  dot: 'bg-emerald-500' },
  improved: { label: 'Improved', color: 'bg-blue-950/50 text-blue-400 border border-blue-700/30',           dot: 'bg-blue-400'    },
  fixed:    { label: 'Fixed',    color: 'bg-amber-950/50 text-amber-400 border border-amber-700/30',        dot: 'bg-amber-400'   },
  removed:  { label: 'Removed',  color: 'bg-red-950/50 text-red-400 border border-red-700/30',              dot: 'bg-red-400'     },
}

const LABEL_META = {
  latest: 'bg-white text-black',
  beta:   'bg-violet-950/60 text-violet-300 border border-violet-700/30',
  major:  'bg-white/10 text-white/70',
}

export default function ChangelogPage() {
  const navigate = useNavigate()
  const user = useAuthStore(s => s.user)

  return (
    <div className="min-h-screen bg-[#0e0e0e] text-white">
      {/* Nav */}
      <div className="max-w-3xl mx-auto px-6 py-6 flex items-center justify-between">
        <button
          onClick={() => navigate(user ? '/feed' : '/login')}
          className="flex items-center gap-2 text-white/40 hover:text-white text-sm transition-colors"
        >
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>arrow_back</span>
          {user ? 'Back to app' : 'Back to login'}
        </button>
        <span className="text-white/20 text-xs">WorkfinderX</span>
      </div>

      <div className="max-w-3xl mx-auto px-6 pb-24">
        <div className="mb-12">
          <h1 className="text-3xl font-black tracking-tight mb-3">Patch Notes</h1>
          <p className="text-white/40 text-sm">
            A record of every release — new features, improvements, and bug fixes.
          </p>
        </div>

        <div className="relative">
          {/* Timeline line */}
          <div className="absolute left-[7px] top-2 bottom-2 w-px bg-white/[0.06]" />

          <div className="space-y-12">
            {RELEASES.map((release) => (
              <div key={release.version} className="relative pl-8">
                {/* Timeline dot */}
                <div className="absolute left-0 top-[6px] w-3.5 h-3.5 rounded-full bg-[#0e0e0e] border-2 border-white/20 flex items-center justify-center">
                  <div className="w-1.5 h-1.5 rounded-full bg-white/40" />
                </div>

                {/* Version header */}
                <div className="flex items-center gap-3 mb-5">
                  <span className="text-lg font-black tracking-tight">v{release.version}</span>
                  {release.label && (
                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${LABEL_META[release.label]}`}>
                      {release.label}
                    </span>
                  )}
                  <span className="text-white/30 text-xs ml-auto">{release.date}</span>
                </div>

                {/* Sections */}
                <div className="space-y-4">
                  {release.sections.map((section) => {
                    const meta = TYPE_META[section.type]
                    return (
                      <div key={section.type} className="bg-[#1a1a1a] border border-white/[0.07] rounded-xl p-5">
                        <div className="flex items-center gap-2 mb-3">
                          <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${meta.color}`}>
                            {meta.label}
                          </span>
                        </div>
                        <ul className="space-y-2">
                          {section.items.map((item, i) => (
                            <li key={i} className="flex gap-2.5 text-sm text-white/60">
                              <span className={`mt-[7px] w-1 h-1 rounded-full flex-shrink-0 ${meta.dot}`} />
                              <span>{item}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="mt-16 pt-6 border-t border-white/[0.06] flex items-center justify-between text-white/25 text-xs">
          <span>WorkfinderX · Open source</span>
          <a
            href="https://github.com/Sanambir/AutoJob-Finder"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-white/60 transition-colors underline underline-offset-2"
          >
            View on GitHub →
          </a>
        </div>
      </div>
    </div>
  )
}
