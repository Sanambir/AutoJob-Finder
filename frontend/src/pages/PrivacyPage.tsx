import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/auth'

export default function PrivacyPage() {
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
        <div className="mb-10">
          <h1 className="text-3xl font-black tracking-tight mb-3">Privacy Policy</h1>
          <p className="text-white/40 text-sm">Last updated: April 2026 &nbsp;·&nbsp; WorkfinderX by Sanambir Singh</p>
        </div>

        <div className="space-y-10 text-[15px] leading-relaxed">

          <Section title="Overview">
            <p className="text-white/60">
              WorkfinderX is a personal project that helps you discover and evaluate job listings using AI.
              We take your data seriously. This policy explains what we collect, why, and how you can control it.
              If you have any questions, email us at{' '}
              <a href="mailto:contact@sanambir.com" className="text-white underline underline-offset-2 hover:text-white/80">contact@sanambir.com</a>.
            </p>
          </Section>

          <Section title="What we collect">
            <ul className="space-y-3 text-white/60">
              <Li><strong className="text-white">Account info</strong> — your name and email address, used to identify your account and send notifications.</Li>
              <Li><strong className="text-white">Resume text</strong> — the content of any resume you upload. This is used exclusively to score and tailor job applications. We store it so you don't have to re-upload on every search.</Li>
              <Li><strong className="text-white">Job data</strong> — job listings we scrape on your behalf (title, company, description, URL). Stored so you can review and track your pipeline.</Li>
              <Li><strong className="text-white">Usage data</strong> — number of daily searches used, last login date. Used to enforce tier limits and improve the product.</Li>
              <Li><strong className="text-white">Activity logs</strong> — a history of searches, scoring events, and emails sent within your account. Visible to you in the Activity section.</Li>
            </ul>
          </Section>

          <Section title="How we use your data">
            <ul className="space-y-3 text-white/60">
              <Li>Your resume text is sent to <strong className="text-white">Google Gemini API</strong> to score job matches and generate tailored cover letters. Google's data processing terms apply. We do not send your resume to job boards.</Li>
              <Li>Job listings are scraped from LinkedIn, Indeed, Glassdoor, and ZipRecruiter via jobspy. We do not store or sell this data to third parties.</Li>
              <Li>If you enable email notifications, your email address is used to send job match summaries via Resend (our SMTP provider). We do not use your email for marketing.</Li>
              <Li>We never sell, rent, or share your personal data with advertisers or data brokers.</Li>
            </ul>
          </Section>

          <Section title="Third-party services">
            <div className="space-y-3 text-white/60">
              <p>WorkfinderX uses the following third-party services:</p>
              <table className="w-full text-sm mt-2">
                <thead>
                  <tr className="text-white/30 text-xs uppercase tracking-wider border-b border-white/[0.06]">
                    <th className="text-left pb-2">Service</th>
                    <th className="text-left pb-2">Purpose</th>
                    <th className="text-left pb-2">Data sent</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  {[
                    ['Google Gemini API', 'AI scoring & tailoring', 'Resume text, job description'],
                    ['Resend (SMTP)', 'Email notifications', 'Your email address, job match data'],
                    ['Coolify / VPS', 'Hosting & database', 'All data (stored on server)'],
                    ['Cloudflare', 'CDN & DDoS protection', 'IP address, request metadata'],
                  ].map(([service, purpose, data]) => (
                    <tr key={service} className="text-white/50">
                      <td className="py-2.5 pr-4 font-medium text-white/70">{service}</td>
                      <td className="py-2.5 pr-4">{purpose}</td>
                      <td className="py-2.5 text-white/40">{data}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          <Section title="Data storage & security">
            <ul className="space-y-3 text-white/60">
              <Li>All data is stored in a SQLite database on a private VPS hosted via Coolify. The database is not publicly accessible.</Li>
              <Li>Passwords are hashed with bcrypt and never stored in plain text. Authentication uses short-lived JWT tokens stored in httpOnly cookies.</Li>
              <Li>Resume text and job descriptions are stored as plain text in the database. We do not encrypt them at rest, so please don't upload documents containing highly sensitive information (e.g. passport numbers, financial data).</Li>
              <Li>All traffic is encrypted via HTTPS/TLS through Cloudflare.</Li>
            </ul>
          </Section>

          <Section title="Data retention">
            <ul className="space-y-3 text-white/60">
              <Li>Your data is retained as long as your account is active.</Li>
              <Li>If you delete your account (Profile → Danger Zone → Delete Account), all your data — including your resume, jobs, and activity logs — is permanently and immediately deleted from our database.</Li>
              <Li>We do not keep backups of individual user data after deletion.</Li>
            </ul>
          </Section>

          <Section title="Your rights">
            <ul className="space-y-3 text-white/60">
              <Li><strong className="text-white">Access</strong> — you can view all your data within the app (Feed, Profile, Activity).</Li>
              <Li><strong className="text-white">Deletion</strong> — delete your account and all data at any time via Profile → Danger Zone.</Li>
              <Li><strong className="text-white">Export</strong> — email us at contact@sanambir.com to request a copy of your data.</Li>
              <Li><strong className="text-white">Correction</strong> — update your name and email address in the Profile page at any time.</Li>
            </ul>
          </Section>

          <Section title="Beta disclaimer">
            <p className="text-white/60">
              WorkfinderX is currently in beta. The platform may have bugs and unexpected behaviour.
              We recommend not relying on it as your sole job-search tool. If you encounter issues
              with your data, please contact us at{' '}
              <a href="mailto:contact@sanambir.com" className="text-white underline underline-offset-2 hover:text-white/80">contact@sanambir.com</a>.
            </p>
          </Section>

          <Section title="Changes to this policy">
            <p className="text-white/60">
              We may update this policy as the product evolves. Significant changes will be communicated
              via email. Continued use of the platform after changes constitutes acceptance of the updated policy.
            </p>
          </Section>

          <div className="pt-6 border-t border-white/[0.06] text-white/30 text-sm">
            Questions? Email us at{' '}
            <a href="mailto:contact@sanambir.com" className="text-white/60 underline underline-offset-2 hover:text-white">contact@sanambir.com</a>
          </div>
        </div>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-lg font-bold text-white mb-3 pb-2 border-b border-white/[0.06]">{title}</h2>
      {children}
    </section>
  )
}

function Li({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-2.5">
      <span className="mt-1.5 w-1 h-1 rounded-full bg-white/20 flex-shrink-0" />
      <span>{children}</span>
    </li>
  )
}
