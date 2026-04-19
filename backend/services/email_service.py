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
import os

SMTP_FROM_EMAIL = os.getenv("SMTP_FROM_EMAIL", SMTP_EMAIL)
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
        clean = re.sub(r"^\d+[\\.)] *", "", line)
        suggestion_items += f"<li style='margin-bottom:10px;color:#c9c9c9;'>{clean}</li>\n"

    # Accent colour matches website badge system
    if match_score >= 75:
        score_color = "#34d399"   # green — emailed badge
    elif match_score >= 50:
        score_color = "#fbbf24"   # yellow — tailoring badge
    else:
        score_color = "#f87171"   # red — error badge

    job_link_html = ""
    if job_url:
        job_link_html = f"""
        <div style="text-align:center; margin:28px 0;">
          <a href="{job_url}"
             style="display:inline-block; padding:12px 28px; background:#ffffff;
                    color:#111111; text-decoration:none; border-radius:10px;
                    font-weight:700; font-size:13px; letter-spacing:.5px;">
            View Job Posting →
          </a>
        </div>"""

    html_body = f"""<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:'Helvetica Neue',Arial,sans-serif;">
  <div style="max-width:600px;margin:40px auto;background:#111111;border-radius:16px;
              overflow:hidden;border:1px solid rgba(255,255,255,0.08);">

    <!-- Header -->
    <div style="padding:28px 32px;border-bottom:1px solid rgba(255,255,255,0.06);
                display:flex;align-items:center;gap:12px;">
      <div style="width:36px;height:36px;background:rgba(255,255,255,0.05);border-radius:10px;
                  display:flex;align-items:center;justify-content:center;
                  border:1px solid rgba(255,255,255,0.08);font-size:18px;line-height:36px;text-align:center;">
        &#9889;
      </div>
      <div>
        <p style="margin:0;font-size:15px;font-weight:700;color:#ffffff;letter-spacing:-.3px;">WorkfinderX</p>
        <p style="margin:2px 0 0;font-size:11px;color:rgba(255,255,255,0.35);text-transform:uppercase;letter-spacing:.8px;">Job Match Report</p>
      </div>
    </div>

    <!-- Score + Job -->
    <div style="padding:28px 32px;">
      <div style="background:#1a1a1a;border-radius:12px;padding:20px 24px;
                  margin-bottom:24px;border-left:3px solid {score_color};
                  display:flex;align-items:center;gap:20px;">
        <div style="text-align:center;min-width:64px;">
          <p style="margin:0;font-size:40px;font-weight:900;color:{score_color};line-height:1;">{match_score}</p>
          <p style="margin:2px 0 0;font-size:10px;color:rgba(255,255,255,0.3);text-transform:uppercase;letter-spacing:.8px;">% Match</p>
        </div>
        <div style="border-left:1px solid rgba(255,255,255,0.08);padding-left:20px;">
          <p style="margin:0;font-size:16px;font-weight:700;color:#ffffff;">{job_title}</p>
          <p style="margin:4px 0 0;font-size:13px;color:rgba(255,255,255,0.45);">{company_name}</p>
        </div>
      </div>

      {job_link_html}

      <!-- Resume Tips -->
      <div style="margin-bottom:24px;">
        <p style="margin:0 0 14px;font-size:11px;font-weight:600;color:rgba(255,255,255,0.35);
                  text-transform:uppercase;letter-spacing:.8px;">Resume Edit Suggestions</p>
        <ol style="margin:0;padding-left:18px;font-size:13px;color:#c9c9c9;line-height:1.75;">
          {suggestion_items}
        </ol>
      </div>

      <!-- Attachment note -->
      <div style="background:#1a1a1a;border-radius:10px;padding:14px 18px;
                  border:1px solid rgba(255,255,255,0.06);display:flex;align-items:center;gap:10px;">
        <span style="font-size:16px;">📄</span>
        <div>
          <p style="margin:0;font-size:13px;font-weight:600;color:#ffffff;">Cover_Letter.pdf attached</p>
          <p style="margin:2px 0 0;font-size:11px;color:rgba(255,255,255,0.3);">
            AI-tailored for {job_title} at {company_name}
          </p>
        </div>
      </div>
    </div>

    <!-- Footer -->
    <div style="padding:16px 32px;border-top:1px solid rgba(255,255,255,0.05);text-align:center;">
      <p style="margin:0;font-size:11px;color:rgba(255,255,255,0.2);">
        Sent automatically by WorkfinderX · ENCRYPTED_PIPELINE_V1.0
      </p>
    </div>
  </div>
</body>
</html>"""


    msg = MIMEMultipart("mixed")
    msg["From"] = f"WorkfinderX <{SMTP_FROM_EMAIL}>"
    msg["To"] = recipient_email
    msg["Subject"] = f"🎯 {match_score}% Match – {job_title} at {company_name} | WorkfinderX"
    msg.attach(MIMEText(html_body, "html"))

    part = MIMEBase("application", "pdf")
    part.set_payload(cover_bytes)
    encoders.encode_base64(part)
    part.add_header("Content-Disposition", 'attachment; filename="Cover_Letter.pdf"')
    msg.attach(part)

    # Port 465 = implicit SSL (SMTP_SSL). Port 587 / 2525 = STARTTLS.
    timeout = 10  # seconds — never hang the pipeline
    if int(SMTP_PORT) == 465:
        import ssl as _ssl
        ctx = _ssl.create_default_context()
        with smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT, context=ctx, timeout=timeout) as server:
            server.login(SMTP_EMAIL, SMTP_PASSWORD)
            server.sendmail(SMTP_FROM_EMAIL, recipient_email, msg.as_string())
    else:
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=timeout) as server:
            server.ehlo()
            server.starttls()
            server.login(SMTP_EMAIL, SMTP_PASSWORD)
            server.sendmail(SMTP_FROM_EMAIL, recipient_email, msg.as_string())

    return {"status": "sent", "recipient": recipient_email}
