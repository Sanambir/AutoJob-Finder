import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/auth'

// ── Types ─────────────────────────────────────────────────────────────────────
interface Section {
  id: string
  icon: string
  title: string
  content: React.ReactNode
}

// ── Sub-components ────────────────────────────────────────────────────────────
function H3({ children }: { children: React.ReactNode }) {
  return <h3 className="text-sm font-bold text-white mb-2 mt-5 first:mt-0">{children}</h3>
}
function P({ children }: { children: React.ReactNode }) {
  return <p className="text-white/55 text-sm leading-relaxed mb-3">{children}</p>
}
function Li({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-2.5 mb-2">
      <span className="mt-1.5 w-1 h-1 rounded-full bg-white/20 flex-shrink-0" />
      <span className="text-white/55 text-sm leading-relaxed">{children}</span>
    </li>
  )
}
function Callout({ icon, color, children }: { icon: string; color: string; children: React.ReactNode }) {
  return (
    <div className={`flex gap-3 p-3.5 rounded-xl border mb-4 ${color}`}>
      <span className="material-symbols-outlined flex-shrink-0 mt-0.5" style={{ fontSize: 16 }}>{icon}</span>
      <p className="text-sm leading-relaxed">{children}</p>
    </div>
  )
}

function StatusBadge({ label, color }: { label: string; color: string }) {
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wide mr-1 mb-1 ${color}`}>
      {label}
    </span>
  )
}

// ── Sections ──────────────────────────────────────────────────────────────────
const SECTIONS: Section[] = [
  {
    id: 'pipeline',
    icon: 'account_tree',
    title: 'How the pipeline works',
    content: (
      <>
        <P>
          Every search triggers a fully automated pipeline. Here's what happens from the moment you click "Start Search":
        </P>

        {/* Pipeline flow */}
        <div className="flex flex-col gap-0 mb-5">
          {[
            { step: '1', icon: 'search', label: 'Scrape', desc: 'WorkfinderX scrapes LinkedIn, Indeed, and other platforms simultaneously using jobspy. Each platform is scraped sequentially to avoid memory overload.' },
            { step: '2', icon: 'psychology', label: 'Score', desc: 'Each job description is sent to Google Gemini alongside your full resume. Gemini returns a 0–100% match score, reasoning, and a list of skills you\'re missing.' },
            { step: '3', icon: 'description', label: 'Tailor', desc: 'For jobs that score above your match threshold, Gemini generates tailored resume suggestions and a personalised cover letter.' },
            { step: '4', icon: 'mail', label: 'Email', desc: 'If email is configured and Auto Pipeline is on, the cover letter PDF is emailed to you automatically for each high-match job.' },
          ].map(({ step, icon, label, desc }, i) => (
            <div key={step} className="flex gap-0">
              <div className="flex flex-col items-center">
                <div className="w-8 h-8 rounded-full bg-white/10 border border-white/20 flex items-center justify-center flex-shrink-0">
                  <span className="material-symbols-outlined text-white/60" style={{ fontSize: 16 }}>{icon}</span>
                </div>
                {i < 3 && <div className="w-px flex-1 bg-white/[0.08] my-1" />}
              </div>
              <div className="ml-4 pb-5">
                <p className="text-white text-sm font-semibold mb-0.5">{step}. {label}</p>
                <p className="text-white/50 text-xs leading-relaxed">{desc}</p>
              </div>
            </div>
          ))}
        </div>

        <Callout icon="schedule" color="bg-blue-950/20 border-blue-700/20 text-blue-300/80">
          A search across 2 platforms with 10 results each typically takes 5–10 minutes end to end. LinkedIn with full descriptions is the slowest — each listing requires a separate HTTP request.
        </Callout>
      </>
    ),
  },
  {
    id: 'statuses',
    icon: 'label',
    title: 'Understanding job statuses',
    content: (
      <>
        <P>Each job card shows a status badge. Here's what every status means and what to do about it:</P>
        <div className="space-y-3">
          {[
            { badge: 'queued',          color: 'bg-blue-950/60 text-blue-300',     meaning: 'Job has been scraped and saved. Waiting for the pipeline to start processing it.' },
            { badge: 'scoring',         color: 'bg-purple-950/60 text-purple-300', meaning: 'Gemini is currently comparing your resume against this job description.' },
            { badge: 'tailoring',       color: 'bg-indigo-950/60 text-indigo-300', meaning: 'Job scored above your threshold. Gemini is generating resume suggestions and a cover letter.' },
            { badge: 'emailing',        color: 'bg-cyan-950/60 text-cyan-300',     meaning: 'Cover letter is being emailed to you.' },
            { badge: 'emailed',         color: 'bg-green-950/60 text-green-300',   meaning: 'Full pipeline complete — scored, tailored, and emailed successfully.' },
            { badge: 'scored',          color: 'bg-white/10 text-white/60',        meaning: 'Job was scored and tailored, but email was skipped (either not configured or Auto Pipeline is off).' },
            { badge: 'below threshold', color: 'bg-amber-950/60 text-amber-400',   meaning: 'Job scored below your match threshold. No tailoring or email was generated. You can lower your threshold in Config to include more matches.' },
            { badge: 'error',           color: 'bg-red-950/60 text-red-400',       meaning: 'Something went wrong. Open the job drawer to see the error message. Use the Retry button to re-run the pipeline.' },
          ].map(({ badge, color, meaning }) => (
            <div key={badge} className="flex items-start gap-3 p-3 bg-white/[0.02] rounded-xl border border-white/[0.04]">
              <StatusBadge label={badge} color={color} />
              <p className="text-white/50 text-xs leading-relaxed">{meaning}</p>
            </div>
          ))}
        </div>
      </>
    ),
  },
  {
    id: 'threshold',
    icon: 'tune',
    title: 'Setting your match threshold',
    content: (
      <>
        <P>
          The match threshold controls which jobs get tailored and emailed. Jobs that score below your threshold are marked "below threshold" and skipped — saving AI credits for jobs that actually fit.
        </P>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
          {[
            { value: '60–70%', label: 'Broad net', desc: 'More jobs, more noise. Good when starting out or in a niche market with few exact matches.' },
            { value: '75–80%', label: 'Balanced', desc: 'The default. Most users find this the right trade-off between volume and quality.' },
            { value: '85–95%', label: 'Precision', desc: 'Only very close matches. Fewer emails, but higher quality. Best when your resume is strong and targeted.' },
          ].map(({ value, label, desc }) => (
            <div key={value} className="p-4 bg-white/[0.03] border border-white/[0.06] rounded-xl">
              <div className="text-2xl font-black text-white mb-1">{value}</div>
              <div className="text-xs font-bold text-white/60 mb-1">{label}</div>
              <p className="text-xs text-white/35 leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
        <Callout icon="lightbulb" color="bg-amber-950/20 border-amber-700/20 text-amber-300/80">
          If you're getting too many "below threshold" results, lower the threshold to 65–70%. If you're getting too many low-quality emails, raise it to 85%.
        </Callout>
      </>
    ),
  },
  {
    id: 'platforms',
    icon: 'public',
    title: 'Platform guide',
    content: (
      <>
        <P>WorkfinderX uses jobspy to scrape job listings. Not all platforms are equally reliable.</P>
        <div className="space-y-3 mb-5">
          {[
            { name: 'LinkedIn',     stable: true,  icon: 'check_circle', color: 'text-green-400',  notes: 'Most reliable. Returns full job descriptions. Slow (each listing is fetched individually) but high quality.' },
            { name: 'Indeed',       stable: true,  icon: 'check_circle', color: 'text-green-400',  notes: 'Fast and reliable. Good volume. Descriptions sometimes truncated.' },
            { name: 'Glassdoor',    stable: false, icon: 'warning',      color: 'text-amber-400',  notes: 'Requires residential proxies to scrape reliably. Often returns 0 results without them. Use as a bonus, not primary.' },
            { name: 'ZipRecruiter', stable: false, icon: 'warning',      color: 'text-amber-400',  notes: 'Same as Glassdoor — inconsistent without proxies. Works occasionally on home connections.' },
          ].map(({ name, icon, color, notes }) => (
            <div key={name} className="flex items-start gap-3 p-4 bg-white/[0.02] border border-white/[0.04] rounded-xl">
              <span className={`material-symbols-outlined ${color} flex-shrink-0 mt-0.5`} style={{ fontSize: 18, fontVariationSettings: "'FILL' 1" }}>{icon}</span>
              <div>
                <p className="text-white text-sm font-semibold mb-0.5">{name}</p>
                <p className="text-white/45 text-xs leading-relaxed">{notes}</p>
              </div>
            </div>
          ))}
        </div>
        <H3>Tips for better results</H3>
        <ul>
          <Li>Always include a location — "Remote", "London", or "New York". Vague searches return fewer results.</Li>
          <Li>Use short, common keywords — "React Developer" works better than "Senior Frontend Engineer TypeScript React".</Li>
          <Li>Set "Posted within" to 7 days for more volume, or 24 hours for very fresh listings.</Li>
          <Li>Start with 10 results/site. Increasing to 25–50 will take significantly longer.</Li>
        </ul>
      </>
    ),
  },
  {
    id: 'resume',
    icon: 'description',
    title: 'Resume tips',
    content: (
      <>
        <H3>What makes a resume score well</H3>
        <P>
          Gemini reads your entire resume and the job description, then scores how well your experience matches the role. The score is based on skills, experience level, and domain relevance — not keyword stuffing.
        </P>
        <ul>
          <Li><strong className="text-white">Include explicit skill keywords.</strong> If you've used React, TypeScript, and AWS, list them. Gemini infers from context but explicit mentions score higher.</Li>
          <Li><strong className="text-white">Use bullet points with impact.</strong> "Built X that resulted in Y" scores better than "responsible for X".</Li>
          <Li><strong className="text-white">Include your job title history.</strong> Gemini uses seniority from past titles to judge fit for senior vs junior roles.</Li>
          <Li><strong className="text-white">Upload the full document.</strong> WorkfinderX uses up to 15,000 characters (~3,000 words). A truncated resume causes Gemini to miss work experience.</Li>
        </ul>
        <H3>Supported formats</H3>
        <ul>
          <Li><strong className="text-white">PDF</strong> — recommended. Text is extracted automatically.</Li>
          <Li><strong className="text-white">DOCX</strong> — supported. Formatting is stripped, plain text is kept.</Li>
          <Li><strong className="text-white">TXT / MD</strong> — works well if your resume is already plain text.</Li>
        </ul>
        <Callout icon="info" color="bg-white/5 border-white/10 text-white/50">
          Scanned PDFs (images of a document) won't work — the text extractor needs selectable text. Export your resume as a proper PDF from Word, Google Docs, or a resume builder.
        </Callout>
      </>
    ),
  },
  {
    id: 'kanban',
    icon: 'view_kanban',
    title: 'Kanban board',
    content: (
      <>
        <P>
          The Board page gives you a 5-column Kanban view to track every job through your application process.
        </P>
        <div className="flex flex-wrap gap-2 mb-5">
          {[
            { stage: 'Discovered', desc: 'Just found — not applied yet' },
            { stage: 'Applied',    desc: 'You\'ve submitted an application' },
            { stage: 'Interview',  desc: 'You\'ve been invited to interview' },
            { stage: 'Offer',      desc: 'You\'ve received an offer' },
            { stage: 'Rejected',   desc: 'Declined or didn\'t progress' },
          ].map(({ stage, desc }) => (
            <div key={stage} className="flex-1 min-w-[140px] p-3 bg-white/[0.03] border border-white/[0.06] rounded-xl">
              <p className="text-white text-xs font-bold mb-0.5">{stage}</p>
              <p className="text-white/35 text-[11px]">{desc}</p>
            </div>
          ))}
        </div>
        <ul>
          <Li>Drag and drop cards between columns, or use the stage dropdown in the job drawer.</Li>
          <Li>When you move a job to <strong className="text-white">Interview</strong>, you can generate AI interview prep Q&amp;A from the job drawer.</Li>
          <Li>Use the <strong className="text-white">Saved only</strong> toggle to see only bookmarked jobs on the board.</Li>
          <Li>Notes can be added per job from the drawer — useful for tracking recruiter names, salary discussed, etc.</Li>
        </ul>
      </>
    ),
  },
  {
    id: 'schedule',
    icon: 'schedule',
    title: 'Auto-search schedule',
    content: (
      <>
        <P>
          The Daily Auto-Search (configured in Config) runs a search automatically once per day at a time you set. This means fresh jobs appear in your feed every morning without you needing to do anything.
        </P>
        <H3>Setting it up</H3>
        <ul>
          <Li>Set your keywords and location in Config → Daily Auto-Search.</Li>
          <Li>Pick a run time. <strong className="text-white">Run time is in UTC</strong> — if you're in UTC+1, set 08:00 to get results by 9am your time.</Li>
          <Li>Toggle it on and click Save.</Li>
          <Li>The scheduler uses the same platforms and settings as the full search form, using your active resume.</Li>
        </ul>
        <Callout icon="info" color="bg-white/5 border-white/10 text-white/50">
          Free accounts get 1 auto-search per day. If the scheduler fires and you've already used your 3 manual searches, the auto-search still runs — the daily limit applies to manual searches initiated from the Search page.
        </Callout>
      </>
    ),
  },
  {
    id: 'interview',
    icon: 'forum',
    title: 'Interview prep',
    content: (
      <>
        <P>
          For any job in your feed, WorkfinderX can generate a personalised interview preparation guide using Gemini — tailored to the specific role and your resume.
        </P>
        <H3>How to generate it</H3>
        <ul>
          <Li>Open any job from the Feed or Board by clicking on it.</Li>
          <Li>In the job drawer, scroll to the <strong className="text-white">Interview Prep</strong> section.</Li>
          <Li>Click <strong className="text-white">Generate Interview Prep</strong>. It takes 15–30 seconds.</Li>
          <Li>You'll get likely interview questions, suggested answers based on your experience, and topics to research.</Li>
        </ul>
        <Callout icon="lightbulb" color="bg-amber-950/20 border-amber-700/20 text-amber-300/80">
          Move the job to the Interview stage on the Kanban board first — it helps you keep track of which roles are active.
        </Callout>
      </>
    ),
  },
  {
    id: 'abtesting',
    icon: 'compare',
    title: 'Resume A/B testing',
    content: (
      <>
        <P>
          If you have multiple resumes uploaded, you can re-score and re-tailor any job with a different resume to see which version performs better.
        </P>
        <H3>How to use it</H3>
        <ul>
          <Li>Upload 2 or more resumes from the Search page (e.g. a "general" and a "frontend-focused" version).</Li>
          <Li>Open a job from the Feed, scroll to the <strong className="text-white">Cover Letter</strong> section in the drawer.</Li>
          <Li>Click <strong className="text-white">Tailor with different resume</strong> and select a resume from the dropdown.</Li>
          <Li>A new cover letter and resume suggestions will be generated using the selected resume.</Li>
        </ul>
        <P>
          The job card will show which resume was used for the last tailoring run. This lets you compare results across your resume versions for the same role.
        </P>
      </>
    ),
  },
  {
    id: 'troubleshooting',
    icon: 'build',
    title: 'Troubleshooting',
    content: (
      <>
        {[
          {
            q: 'Search returns 0 results',
            a: 'Try a broader keyword (e.g. "React" instead of "Senior React TypeScript Developer"). Make sure you have a location set. LinkedIn and Indeed are the most reliable — try with just those two first. Glassdoor and ZipRecruiter often return 0 without proxies.',
          },
          {
            q: 'Jobs are stuck in "queued" or "scoring"',
            a: 'The pipeline runs in the background and may take a few minutes per job. If jobs are still stuck after 15 minutes, they may have hit an error. Refresh the page — stuck jobs are automatically reset to "error" on the next server restart. Use Retry to re-process them.',
          },
          {
            q: 'I\'m not receiving emails',
            a: 'Check Config → Email Delivery — it should show "SMTP Active". If it shows "Not Set", SMTP isn\'t configured. Also check your spam folder. Open the job drawer — if the status is "scored" instead of "emailed", look for an error message explaining why the email failed.',
          },
          {
            q: 'Cover letter quality is poor',
            a: 'This usually means your resume doesn\'t have enough detail for Gemini to work with. Make sure your resume has specific bullet points with technologies, achievements, and measurable outcomes. A one-page resume with vague descriptions will produce generic cover letters.',
          },
          {
            q: 'All my jobs are "below threshold"',
            a: 'Lower your match threshold in Config (try 65–70%). Also check that your active resume is correct — if the wrong resume is active, scores will be off. You can also upload a more targeted resume version.',
          },
          {
            q: 'The pipeline ran but the cover letter is missing',
            a: 'If the job status is "scored" (not "emailed"), the tailoring step may have been skipped because Auto Pipeline was off. Open the job drawer and click "Generate Cover Letter" to run tailoring manually.',
          },
        ].map(({ q, a }) => (
          <div key={q} className="mb-5">
            <p className="text-white text-sm font-semibold mb-1.5">"{q}"</p>
            <p className="text-white/50 text-sm leading-relaxed">{a}</p>
          </div>
        ))}
        <Callout icon="mail" color="bg-white/[0.03] border-white/[0.06] text-white/40">
          Still stuck? Email <a href="mailto:contact@sanambir.com" className="text-white/70 underline underline-offset-2">contact@sanambir.com</a> or open an issue on <a href="https://github.com/Sanambir/AutoJob-Finder/issues" target="_blank" rel="noopener noreferrer" className="text-white/70 underline underline-offset-2">GitHub</a>.
        </Callout>
      </>
    ),
  },
]

// ── Main component ────────────────────────────────────────────────────────────
export default function DocsPage() {
  const navigate = useNavigate()
  const user = useAuthStore(s => s.user)
  const [active, setActive] = useState('pipeline')

  const current = SECTIONS.find(s => s.id === active) ?? SECTIONS[0]

  return (
    <div className="min-h-screen bg-[#0e0e0e] text-white">
      {/* Nav */}
      <div className="max-w-6xl mx-auto px-6 py-6 flex items-center justify-between border-b border-white/[0.05]">
        <button
          onClick={() => navigate(user ? '/feed' : '/login')}
          className="flex items-center gap-2 text-white/40 hover:text-white text-sm transition-colors"
        >
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>arrow_back</span>
          {user ? 'Back to app' : 'Back to login'}
        </button>
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/support')} className="text-white/25 text-xs hover:text-white/50 transition-colors">Support</button>
          <button onClick={() => navigate('/privacy')} className="text-white/25 text-xs hover:text-white/50 transition-colors">Privacy</button>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-black tracking-tight mb-2">Documentation</h1>
          <p className="text-white/40 text-sm">Everything you need to get the most out of WorkfinderX.</p>
        </div>

        <div className="flex gap-8">
          {/* Sidebar nav */}
          <aside className="hidden md:flex flex-col w-52 flex-shrink-0 gap-1">
            {SECTIONS.map(s => (
              <button
                key={s.id}
                onClick={() => setActive(s.id)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-left text-sm transition-all
                  ${active === s.id
                    ? 'bg-white/10 text-white font-semibold'
                    : 'text-white/40 hover:text-white hover:bg-white/[0.04]'
                  }`}
              >
                <span className="material-symbols-outlined flex-shrink-0" style={{ fontSize: 17 }}>{s.icon}</span>
                <span>{s.title}</span>
              </button>
            ))}
          </aside>

          {/* Mobile: horizontal scroll nav */}
          <div className="md:hidden w-full mb-6">
            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none">
              {SECTIONS.map(s => (
                <button
                  key={s.id}
                  onClick={() => setActive(s.id)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap flex-shrink-0 transition-all
                    ${active === s.id ? 'bg-white text-black' : 'bg-white/5 text-white/50'}`}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 14 }}>{s.icon}</span>
                  {s.title}
                </button>
              ))}
            </div>
          </div>

          {/* Content */}
          <main className="flex-1 min-w-0">
            <div className="bg-[#1a1a1a] border border-white/[0.07] rounded-2xl p-6 md:p-8">
              <div className="flex items-center gap-3 mb-6 pb-5 border-b border-white/[0.06]">
                <div className="w-9 h-9 rounded-lg bg-white/5 flex items-center justify-center flex-shrink-0">
                  <span className="material-symbols-outlined text-white/60" style={{ fontSize: 20 }}>{current.icon}</span>
                </div>
                <h2 className="text-lg font-bold text-white">{current.title}</h2>
              </div>
              {current.content}
            </div>

            {/* Prev / Next */}
            <div className="flex items-center justify-between mt-4 gap-3">
              {(() => {
                const idx = SECTIONS.findIndex(s => s.id === active)
                const prev = SECTIONS[idx - 1]
                const next = SECTIONS[idx + 1]
                return (
                  <>
                    {prev ? (
                      <button
                        onClick={() => setActive(prev.id)}
                        className="flex items-center gap-2 px-4 py-2.5 bg-white/[0.04] hover:bg-white/[0.08] rounded-xl text-white/50 hover:text-white text-sm transition-all"
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>arrow_back</span>
                        {prev.title}
                      </button>
                    ) : <div />}
                    {next && (
                      <button
                        onClick={() => setActive(next.id)}
                        className="flex items-center gap-2 px-4 py-2.5 bg-white/[0.04] hover:bg-white/[0.08] rounded-xl text-white/50 hover:text-white text-sm transition-all ml-auto"
                      >
                        {next.title}
                        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>arrow_forward</span>
                      </button>
                    )}
                  </>
                )
              })()}
            </div>
          </main>
        </div>
      </div>
    </div>
  )
}
