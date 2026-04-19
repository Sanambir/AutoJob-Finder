import io
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, HRFlowable, ListFlowable, ListItem
)
from reportlab.lib.enums import TA_LEFT, TA_CENTER


def _base_style() -> ParagraphStyle:
    return ParagraphStyle(
        "base",
        fontName="Helvetica",
        fontSize=10,
        leading=14,
        textColor=colors.HexColor("#1a1a2e"),
    )


def generate_resume_pdf(name: str, content: str) -> bytes:
    """Generate a styled resume PDF and return bytes."""
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=letter,
        rightMargin=0.75 * inch,
        leftMargin=0.75 * inch,
        topMargin=0.75 * inch,
        bottomMargin=0.75 * inch,
    )
    styles = getSampleStyleSheet()
    story = []

    # Header
    title_style = ParagraphStyle(
        "title",
        parent=styles["Title"],
        fontSize=22,
        fontName="Helvetica-Bold",
        textColor=colors.HexColor("#0f3460"),
        spaceAfter=2,
        alignment=TA_CENTER,
    )
    subtitle_style = ParagraphStyle(
        "subtitle",
        fontSize=10,
        fontName="Helvetica",
        textColor=colors.HexColor("#6c757d"),
        alignment=TA_CENTER,
        spaceAfter=6,
    )
    story.append(Paragraph(name or "Tailored Resume", title_style))
    story.append(Paragraph("AI-Tailored by WorkfinderX", subtitle_style))
    story.append(HRFlowable(width="100%", thickness=1.5, color=colors.HexColor("#0f3460")))
    story.append(Spacer(1, 0.15 * inch))

    section_style = ParagraphStyle(
        "section",
        fontName="Helvetica-Bold",
        fontSize=12,
        textColor=colors.HexColor("#0f3460"),
        spaceBefore=10,
        spaceAfter=4,
    )
    body_style = ParagraphStyle(
        "body",
        fontName="Helvetica",
        fontSize=10,
        leading=15,
        textColor=colors.HexColor("#212529"),
        spaceAfter=4,
    )

    current_section = None
    for line in content.splitlines():
        line = line.strip()
        if not line:
            story.append(Spacer(1, 0.05 * inch))
            continue
        # Detect section headers (ALL CAPS or ends with colon and short)
        if line.isupper() or (line.endswith(":") and len(line) < 40):
            if current_section:
                story.append(HRFlowable(width="100%", thickness=0.5, color=colors.HexColor("#dee2e6")))
            story.append(Paragraph(line.rstrip(":"), section_style))
            current_section = line
        elif line.startswith("•") or line.startswith("-") or line.startswith("*"):
            bullet_text = line.lstrip("•-* ").strip()
            story.append(
                Paragraph(f"• {bullet_text}", body_style)
            )
        else:
            story.append(Paragraph(line, body_style))

    doc.build(story)
    return buf.getvalue()


def generate_cover_letter_pdf(name: str, content: str) -> bytes:
    """Generate a clean, minimal cover letter PDF and return bytes.

    Design: white page, generous margins, name as small-caps header,
    thin rule divider, body paragraphs in readable 11pt Helvetica.
    No colours, no decorations — ready for professional submission.
    """
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=letter,
        rightMargin=1.1 * inch,
        leftMargin=1.1 * inch,
        topMargin=1.1 * inch,
        bottomMargin=1.1 * inch,
    )
    story = []

    name_style = ParagraphStyle(
        "name",
        fontName="Helvetica-Bold",
        fontSize=16,
        textColor=colors.HexColor("#111111"),
        spaceAfter=2,
        alignment=TA_LEFT,
    )
    tagline_style = ParagraphStyle(
        "tagline",
        fontName="Helvetica",
        fontSize=9,
        textColor=colors.HexColor("#888888"),
        spaceAfter=10,
        alignment=TA_LEFT,
    )
    body_style = ParagraphStyle(
        "body",
        fontName="Helvetica",
        fontSize=11,
        leading=17,
        textColor=colors.HexColor("#1a1a1a"),
        spaceAfter=10,
        alignment=TA_LEFT,
    )

    story.append(Paragraph(name or "Cover Letter", name_style))
    story.append(Paragraph("WorkfinderX · AI-tailored for this role", tagline_style))
    story.append(HRFlowable(width="100%", thickness=0.5, color=colors.HexColor("#cccccc")))
    story.append(Spacer(1, 0.18 * inch))

    for para in content.split("\n\n"):
        para = para.strip()
        if para:
            story.append(Paragraph(para.replace("\n", " "), body_style))

    doc.build(story)
    return buf.getvalue()
