import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/auth'

const FAQS = [
  {
    q: 'How does the job scoring work?',
    a: 'WorkfinderX sends your resume and each job description to Google Gemini AI, which returns a match score from 0–100% along with reasoning and a list of skills you\'re missing. Jobs that score above your match threshold (default 75%) are eligible for resume tailoring and cover letter generation.',
  },
  {
    q: 'Why am I getting 0 results from a search?',
    a: 'A few common reasons: (1) LinkedIn and Indeed require a location — try "Remote" or a specific city. (2) Keywords may be too specific — try shorter terms like "React Developer" instead of a full job title. (3) Glassdoor and ZipRecruiter are marked ⚠ because they often require proxies to scrape reliably. Stick to LinkedIn + Indeed for the most consistent results.',
  },
  {
    q: 'Is my resume data safe?',
    a: 'Your resume text is stored in an encrypted-in-transit (HTTPS) database on a private VPS. It is sent to the Google Gemini API for AI processing — Google\'s data terms apply. We never sell or share your resume with third parties. You can delete all your data at any time from Profile → Danger Zone.',
  },
  {
    q: 'What is the difference between Free and Premium?',
    a: 'Free accounts can run 3 searches per day. Premium accounts get 10 searches per day. Both tiers have access to all features — scoring, tailoring, cover letter generation, Kanban board, interview prep, and analytics. To upgrade, email contact@sanambir.com.',
  },
  {
    q: 'The pipeline ran but I didn\'t receive an email — what happened?',
    a: 'Check the job card in the Feed — if it shows "scored" instead of "emailed", the email step was skipped or failed. Open the job drawer to see the error message. Common causes: SMTP not configured, recipient email invalid, or the Resend API rate limit was hit. You can still view the cover letter and resume suggestions in the job drawer.',
  },
  {
    q: 'How do I use Resume A/B testing?',
    a: 'Upload multiple resumes in the Search page. Open any job in the Feed drawer, then use the "Tailor with different resume" option to re-run the tailoring step with a different resume. The score and cover letter will update for that resume, and you can compare results across your saved resumes.',
  },
  {
    q: 'What does "below threshold" mean?',
    a: 'When a job scores below your match threshold (default 75%), it is marked "below threshold" and skipped for tailoring and emailing — to avoid wasting AI credits on poor matches. You can lower your threshold in Config, or bulk-delete low-match jobs from the Feed.',
  },
  {
    q: 'Can I delete all my jobs and start fresh?',
    a: 'Yes. In the Feed, use "Select all" then "Delete Selected" to remove all jobs. You can also delete individual jobs from the job drawer. Your resume and account settings are unaffected.',
  },
  {
    q: 'The search is stuck or taking very long — is that normal?',
    a: 'LinkedIn searches with full job descriptions can take 2–3 minutes per platform because each listing requires a separate HTTP request. The pipeline then runs AI scoring on every job in parallel. A search across 2 platforms with 10 results each can take 5–8 minutes total. If it\'s stuck for more than 15 minutes, try a new search.',
  },
  {
    q: 'How do I report a bug or request a feature?',
    a: 'Open a GitHub issue at github.com/Sanambir/AutoJob-Finder or email contact@sanambir.com. The project is open source and contributions are welcome.',
  },
]

export default function SupportPage() {
  const navigate = useNavigate()
  const user = useAuthStore(s => s.user)
  const [open, setOpen] = useState<number | null>(null)

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
        <div className="mb-10">
          <h1 className="text-3xl font-black tracking-tight mb-3">Support & FAQ</h1>
          <p className="text-white/40 text-sm">Answers to common questions. Can't find what you need? Email us.</p>
        </div>

        {/* FAQ accordion */}
        <div className="space-y-2 mb-16">
          {FAQS.map((faq, i) => (
            <div
              key={i}
              className="bg-[#1a1a1a] border border-white/[0.07] rounded-xl overflow-hidden"
            >
              <button
                onClick={() => setOpen(open === i ? null : i)}
                className="w-full flex items-center justify-between px-5 py-4 text-left gap-4"
              >
                <span className="text-sm font-semibold text-white">{faq.q}</span>
                <span
                  className="material-symbols-outlined text-white/30 flex-shrink-0 transition-transform duration-200"
                  style={{ fontSize: 20, transform: open === i ? 'rotate(180deg)' : 'rotate(0deg)' }}
                >
                  expand_more
                </span>
              </button>
              {open === i && (
                <div className="px-5 pb-5">
                  <p className="text-white/55 text-sm leading-relaxed">{faq.a}</p>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Contact section */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <ContactCard
            icon="mail"
            title="Email support"
            description="For bugs, data requests, or upgrade questions"
            cta="contact@sanambir.com"
            href="mailto:contact@sanambir.com?subject=WorkfinderX Support"
          />
          <ContactCard
            icon="bug_report"
            title="Report a bug"
            description="Open an issue on GitHub — the project is open source"
            cta="github.com/Sanambir/AutoJob-Finder"
            href="https://github.com/Sanambir/AutoJob-Finder/issues"
          />
          <ContactCard
            icon="workspace_premium"
            title="Upgrade to Premium"
            description="Get 10 searches/day instead of 3"
            cta="Email to upgrade"
            href="mailto:contact@sanambir.com?subject=WorkfinderX Premium Upgrade"
          />
          <ContactCard
            icon="policy"
            title="Privacy Policy"
            description="How we handle your resume and account data"
            cta="Read the policy"
            href="/privacy"
            internal
          />
        </div>
      </div>
    </div>
  )
}

function ContactCard({
  icon, title, description, cta, href, internal,
}: {
  icon: string; title: string; description: string; cta: string; href: string; internal?: boolean
}) {
  const navigate = useNavigate()
  return (
    <div className="bg-[#1a1a1a] border border-white/[0.07] rounded-xl p-5 flex flex-col gap-3">
      <div className="w-9 h-9 rounded-lg bg-white/5 flex items-center justify-center">
        <span className="material-symbols-outlined text-white/50" style={{ fontSize: 20 }}>{icon}</span>
      </div>
      <div>
        <p className="text-sm font-semibold text-white mb-0.5">{title}</p>
        <p className="text-xs text-white/40">{description}</p>
      </div>
      <button
        onClick={() => internal ? navigate(href) : window.open(href, internal ? '_self' : '_blank')}
        className="mt-auto text-xs text-white/60 hover:text-white underline underline-offset-2 transition-colors text-left"
      >
        {cta} →
      </button>
    </div>
  )
}
