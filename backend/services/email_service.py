"""
Email service — called directly by the search pipeline and /send-email router.
"""
import re
import smtplib
from email import encoders
from email.mime.base import MIMEBase
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from config import SMTP_EMAIL, SMTP_HOST, SMTP_PASSWORD, SMTP_PORT
from services.pdf_service import generate_cover_letter_pdf


async def send_match_email(
    recipient_email: str,
    applicant_name: str,
    job_title: str,
    company_name: str,
    job_url: str,
    resume_suggestions: str,
    cover_letter: str,
    match_score: int,
) -> dict:
    """
    Send a match notification email with cover letter PDF attachment.

    Returns {"status": "sent", "recipient": recipient_email} on success.
    Returns {"status": "skipped", "reason": "..."} if SMTP is not configured.
    Raises smtplib.SMTPAuthenticationError or generic Exception on failure.
    """
    if not SMTP_EMAIL or not SMTP_PASSWORD:
        # Gracefully skip email instead of crashing the whole pipeline
        return {"status": "skipped", "reason": "SMTP credentials not configured"}

    cover_bytes = generate_cover_letter_pdf(applicant_name, cover_letter)

    raw_lines = resume_suggestions.strip().splitlines()
    suggestion_items = ""
    for line in raw_lines:
        line = line.strip()
        if not line:
            continue
        clean = re.sub(r"^\d+[\.)] *", "", line)
        suggestion_items += f"<li style='margin-bottom:10px;'>{clean}</li>\n"

    score_color = "#22c55e" if match_score >= 75 else "#f59e0b" if match_score >= 50 else "#ef4444"

    job_link_html = ""
    if job_url:
        job_link_html = f"""
        <div style="text-align:center; margin:28px 0;">
          <a href="{job_url}"
             style="display:inline-block; padding:14px 32px; background:linear-gradient(135deg,#0f3460,#e94560);
                    color:#fff; text-decoration:none; border-radius:10px; font-weight:700; font-size:14px;
                    letter-spacing:.3px;">
            🔗 View Job Posting ↗
          </a>
        </div>"""

    html_body = f"""
    <html><body style="font-family:'Helvetica Neue',Arial,sans-serif; background:#0d1117; color:#e6edf3; padding:32px;">
      <div style="max-width:640px; margin:0 auto; background:#161b22; border-radius:14px; overflow:hidden; border:1px solid #30363d;">
        <div style="background:linear-gradient(135deg,#0f3460,#e94560); padding:28px 32px;">
          <h1 style="margin:0; font-size:22px; color:#fff;">⚡ ResumeFlow AI</h1>
          <p style="margin:6px 0 0; color:rgba(255,255,255,0.8); font-size:13px;">
            New job match found — your personalised documents are ready
          </p>
        </div>
        <div style="padding:28px 32px;">
          <div style="display:flex; align-items:center; gap:16px; background:#21262d;
                      border-radius:10px; padding:14px 20px; margin-bottom:24px; border-left:4px solid {score_color};">
            <div>
              <p style="margin:0; font-size:12px; color:#8b949e; text-transform:uppercase; letter-spacing:.5px;">Match Score</p>
              <p style="margin:4px 0 0; font-size:36px; font-weight:800; color:{score_color}; line-height:1;">{match_score}%</p>
            </div>
            <div style="border-left:1px solid #30363d; padding-left:16px;">
              <p style="margin:0; font-weight:700; color:#e6edf3; font-size:14px;">{job_title}</p>
              <p style="margin:3px 0 0; color:#8b949e; font-size:13px;">{company_name}</p>
            </div>
          </div>
          {job_link_html}
          <div style="margin-bottom:24px;">
            <h3 style="margin:0 0 12px; font-size:14px; color:#e94560; text-transform:uppercase;
                       letter-spacing:.8px; border-bottom:1px solid #30363d; padding-bottom:8px;">
              ✏️ Resume Edit Suggestions
            </h3>
            <ol style="margin:0; padding-left:20px; font-size:13px; color:#e6edf3; line-height:1.7;">
              {suggestion_items}
            </ol>
          </div>
          <div style="background:#21262d; border-radius:8px; padding:14px 18px; font-size:13px; color:#8b949e;">
            📝 <strong style="color:#e6edf3;">Cover_Letter.pdf</strong> is attached — personalised for this role by Gemini 1.5 Flash.
          </div>
        </div>
        <div style="padding:14px 32px; border-top:1px solid #30363d; text-align:center;">
          <p style="color:#484f58; font-size:11px; margin:0;">Sent automatically by ResumeFlow AI</p>
        </div>
      </div>
    </body></html>
    """

    msg = MIMEMultipart("mixed")
    msg["From"] = SMTP_EMAIL
    msg["To"] = recipient_email
    msg["Subject"] = f"🎯 {match_score}% Match – {job_title} at {company_name} | ResumeFlow AI"
    msg.attach(MIMEText(html_body, "html"))

    part = MIMEBase("application", "pdf")
    part.set_payload(cover_bytes)
    encoders.encode_base64(part)
    part.add_header("Content-Disposition", 'attachment; filename="Cover_Letter.pdf"')
    msg.attach(part)

    with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
        server.ehlo()
        server.starttls()
        server.login(SMTP_EMAIL, SMTP_PASSWORD)
        server.sendmail(SMTP_EMAIL, recipient_email, msg.as_string())

    return {"status": "sent", "recipient": recipient_email}
