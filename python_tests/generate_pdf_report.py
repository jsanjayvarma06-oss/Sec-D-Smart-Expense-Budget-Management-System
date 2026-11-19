import os
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable, KeepTogether
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch

def generate_pdf():
    pdf_path = "/Users/sanjayvarma/Desktop/se mini/Branch_Test_and_Coverage_Report.pdf"
    doc = SimpleDocTemplate(
        pdf_path,
        pagesize=letter,
        rightMargin=40,
        leftMargin=40,
        topMargin=40,
        bottomMargin=40,
    )
    
    styles = getSampleStyleSheet()
    
    # Custom styles
    title_style = ParagraphStyle(
        'DocTitle',
        parent=styles['Heading1'],
        fontSize=20,
        leading=24,
        textColor=colors.HexColor('#1E293B'),
        fontName='Helvetica-Bold',
        spaceAfter=4,
    )
    
    subtitle_style = ParagraphStyle(
        'DocSubtitle',
        parent=styles['Normal'],
        fontSize=11,
        leading=15,
        textColor=colors.HexColor('#64748B'),
        fontName='Helvetica',
        spaceAfter=15,
    )

    h2_style = ParagraphStyle(
        'Heading2_Custom',
        parent=styles['Heading2'],
        fontSize=13,
        leading=17,
        textColor=colors.HexColor('#0F172A'),
        fontName='Helvetica-Bold',
        spaceBefore=14,
        spaceAfter=8,
    )

    body_style = ParagraphStyle(
        'Body_Custom',
        parent=styles['Normal'],
        fontSize=9.5,
        leading=13.5,
        textColor=colors.HexColor('#334155'),
        spaceAfter=6,
    )

    table_header_style = ParagraphStyle(
        'TableHeader',
        parent=styles['Normal'],
        fontSize=8.5,
        leading=11,
        textColor=colors.white,
        fontName='Helvetica-Bold',
        alignment=1, # Center
    )

    table_cell_style = ParagraphStyle(
        'TableCell',
        parent=styles['Normal'],
        fontSize=8,
        leading=11,
        textColor=colors.HexColor('#1E293B'),
    )

    table_cell_bold = ParagraphStyle(
        'TableCellBold',
        parent=table_cell_style,
        fontName='Helvetica-Bold',
    )

    pass_style = ParagraphStyle(
        'PassBadge',
        parent=table_cell_style,
        fontName='Helvetica-Bold',
        textColor=colors.HexColor('#15803D'),
        alignment=1,
    )

    elements = []

    # Title & Metadata
    elements.append(Paragraph("Smart Expense & Budget Management System", title_style))
    elements.append(Paragraph("Branch Testing & Code Coverage Report (pytest & pytest-cov)", subtitle_style))
    elements.append(HRFlowable(width="100%", thickness=1.5, color=colors.HexColor('#2563EB'), spaceAfter=14))

    meta_data = [
        [Paragraph("<b>Project:</b> Smart Expense Management", body_style), Paragraph("<b>Test Framework:</b> pytest 9.2.0 + pytest-cov 7.1.0", body_style)],
        [Paragraph("<b>Author / Tester:</b> Sanjay Varma (Sec-D)", body_style), Paragraph("<b>Coverage Mode:</b> Branch & Statement Coverage (--cov-branch)", body_style)],
        [Paragraph("<b>Execution Date:</b> November 19, 2026", body_style), Paragraph("<b>Overall Status:</b> <font color='#16A34A'><b>100% Passed (15/15)</b></font>", body_style)],
    ]
    meta_table = Table(meta_data, colWidths=[260, 272])
    meta_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor('#F8FAFC')),
        ('PADDING', (0,0), (-1,-1), 6),
        ('BOX', (0,0), (-1,-1), 0.5, colors.HexColor('#E2E8F0')),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
    ]))
    elements.append(meta_table)
    elements.append(Spacer(1, 12))

    # Executive Summary Section
    elements.append(Paragraph("1. Code Coverage & Branch Verification Summary", h2_style))
    elements.append(Paragraph(
        "Branch testing evaluates every conditional branch (decision outcome) in the domain algorithms. "
        "Instrumentation was executed via <code>pytest-cov</code> with the <code>--cov-branch</code> flag enabled. "
        "A total of <b>22 distinct decision branches</b> and <b>64 program statements</b> were validated across all core services without a single missed path.",
        body_style
    ))

    cov_data = [
        [Paragraph("Module / Service File", table_header_style), Paragraph("Statements", table_header_style), Paragraph("Missed", table_header_style), Paragraph("Branches", table_header_style), Paragraph("Partial", table_header_style), Paragraph("Branch Cov %", table_header_style), Paragraph("Status", table_header_style)],
        [Paragraph("src/smart_expense/anomaly_detection.py", table_cell_bold), Paragraph("13", table_cell_style), Paragraph("0", table_cell_style), Paragraph("2", table_cell_style), Paragraph("0", table_cell_style), Paragraph("100%", table_cell_bold), Paragraph("PASSED", pass_style)],
        [Paragraph("src/smart_expense/financial_health.py", table_cell_bold), Paragraph("44", table_cell_style), Paragraph("0", table_cell_style), Paragraph("18", table_cell_style), Paragraph("0", table_cell_style), Paragraph("100%", table_cell_bold), Paragraph("PASSED", pass_style)],
        [Paragraph("src/smart_expense/forecast.py", table_cell_bold), Paragraph("7", table_cell_style), Paragraph("0", table_cell_style), Paragraph("2", table_cell_style), Paragraph("0", table_cell_style), Paragraph("100%", table_cell_bold), Paragraph("PASSED", pass_style)],
        [Paragraph("src/smart_expense/__init__.py", table_cell_style), Paragraph("0", table_cell_style), Paragraph("0", table_cell_style), Paragraph("0", table_cell_style), Paragraph("0", table_cell_style), Paragraph("100%", table_cell_style), Paragraph("PASSED", pass_style)],
        [Paragraph("<b>TOTAL (All Modules)</b>", table_cell_bold), Paragraph("<b>64</b>", table_cell_bold), Paragraph("<b>0</b>", table_cell_bold), Paragraph("<b>22</b>", table_cell_bold), Paragraph("<b>0</b>", table_cell_bold), Paragraph("<b>100%</b>", table_cell_bold), Paragraph("<b>100%</b>", pass_style)],
    ]
    cov_table = Table(cov_data, colWidths=[182, 55, 45, 55, 45, 80, 70])
    cov_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#1E293B')),
        ('PADDING', (0,0), (-1,-1), 4.5),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#CBD5E1')),
        ('BACKGROUND', (0,-1), (-1,-1), colors.HexColor('#F1F5F9')),
        ('ALIGN', (1,1), (-1,-1), 'CENTER'),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
    ]))
    elements.append(cov_table)
    elements.append(Spacer(1, 14))

    # Detailed Test Results Table
    elements.append(Paragraph("2. Detailed Pytest Execution Results (15/15 Passed)", h2_style))
    
    test_cases_data = [
        [Paragraph("Test Case Identifier", table_header_style), Paragraph("Target Feature / Branch Path Tested", table_header_style), Paragraph("Expected Result", table_header_style), Paragraph("Outcome", table_header_style)],
        
        # Anomaly Detection
        [Paragraph("test_to_paise_conversion", table_cell_bold), Paragraph("Paise precision & rounding conversion", table_cell_style), Paragraph("Float & string parsed to exact paise without rounding error", table_cell_style), Paragraph("PASS", pass_style)],
        [Paragraph("test_insufficient_history_branch", table_cell_bold), Paragraph("Branch: history &lt; 5 transactions", table_cell_style), Paragraph("is_unusual=False with explanation 'Not enough history'", table_cell_style), Paragraph("PASS", pass_style)],
        [Paragraph("test_normal_spending_branch", table_cell_bold), Paragraph("Branch: amount &le; 3x average", table_cell_style), Paragraph("is_unusual=False, reason=None", table_cell_style), Paragraph("PASS", pass_style)],
        [Paragraph("test_exact_threshold_boundary_branch", table_cell_bold), Paragraph("Boundary branch: amount == 3x average exactly", table_cell_style), Paragraph("Strict inequality holds (is_unusual=False)", table_cell_style), Paragraph("PASS", pass_style)],
        [Paragraph("test_unusual_spending_branch", table_cell_bold), Paragraph("Branch: amount &gt; 3x average", table_cell_style), Paragraph("is_unusual=True, flagged with reason description", table_cell_style), Paragraph("PASS", pass_style)],

        # Financial Health
        [Paragraph("test_invalid_month_format_branch", table_cell_bold), Paragraph("Branch: month non-string or invalid regex", table_cell_style), Paragraph("Raises TypeError('Month must use YYYY-MM format')", table_cell_style), Paragraph("PASS", pass_style)],
        [Paragraph("test_invalid_month_range_branch", table_cell_bold), Paragraph("Branch: year &lt; 1900 or month &lt; 1 / &gt; 12", table_cell_style), Paragraph("Raises TypeError('Enter a valid month')", table_cell_style), Paragraph("PASS", pass_style)],
        [Paragraph("test_no_income_branch", table_cell_bold), Paragraph("Branch: income &le; 0 paise (-10 pts)", table_cell_style), Paragraph("Score penalty recorded, reason noted", table_cell_style), Paragraph("PASS", pass_style)],
        [Paragraph("test_savings_gt_20_and_budget_under_80", table_cell_bold), Paragraph("Branches: savings &ge; 20% (+30), budget &le; 80% (+20)", table_cell_style), Paragraph("Maximum score 100 with twin positive rationales", table_cell_style), Paragraph("PASS", pass_style)],
        [Paragraph("test_savings_10_to_20_and_budget_under_100", table_cell_bold), Paragraph("Branches: savings 10–20% (+20), budget &le; 100% (+10)", table_cell_style), Paragraph("Total score 80 with appropriate recommendations", table_cell_style), Paragraph("PASS", pass_style)],
        [Paragraph("test_savings_positive_and_budget_exceeded", table_cell_bold), Paragraph("Branches: savings &gt; 0 (+10), budget exceeded (-15)", table_cell_style), Paragraph("Score drops to 45 with budget overrun alert", table_cell_style), Paragraph("PASS", pass_style)],
        [Paragraph("test_expenses_exceed_income_branch", table_cell_bold), Paragraph("Branch: expenses &ge; income (-25 pts)", table_cell_style), Paragraph("Deficit recognized, score reflects overspending", table_cell_style), Paragraph("PASS", pass_style)],
        [Paragraph("test_clamping_minimum_zero", table_cell_bold), Paragraph("Branch: score &lt; 0 clamp bounds", table_cell_style), Paragraph("Score clamped strictly to [0, 100] interval", table_cell_style), Paragraph("PASS", pass_style)],

        # Forecast
        [Paragraph("test_insufficient_history_branch", table_cell_bold), Paragraph("Branch: spending history &lt; 3 months", table_cell_style), Paragraph("available=False with 'At least 3 months required'", table_cell_style), Paragraph("PASS", pass_style)],
        [Paragraph("test_sufficient_history_branch", table_cell_bold), Paragraph("Branch: spending history &ge; 3 months", table_cell_style), Paragraph("available=True, forecast calculated accurately", table_cell_style), Paragraph("PASS", pass_style)],
    ]

    tests_table = Table(test_cases_data, colWidths=[145, 155, 172, 60])
    tests_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#2563EB')),
        ('PADDING', (0,0), (-1,-1), 4),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#E2E8F0')),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, colors.HexColor('#F8FAFC')]),
    ]))
    elements.append(tests_table)
    elements.append(Spacer(1, 14))

    # How to run locally
    elements.append(Paragraph("3. Command Reference", h2_style))
    cmd_text = (
        "<b>Execute All Tests:</b> <code>pytest</code> or <code>./python_tests/run_tests.sh</code><br/>"
        "<b>Branch Coverage CLI:</b> <code>pytest --cov=src/smart_expense --cov-branch --cov-report=term-missing</code><br/>"
        "<b>HTML Interactive View:</b> Open <code>python_tests/htmlcov/index.html</code> in any web browser."
    )
    elements.append(Paragraph(cmd_text, body_style))

    doc.build(elements)
    print(f"Report generated successfully at: {pdf_path}")

if __name__ == "__main__":
    generate_pdf()
