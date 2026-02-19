"""
DPR PDF Generation Service

Generates professional PDF reports with:
- Page 1: Project details, Voice summary, Worker attendance
- Page 2+: One image per page with caption

Filename format: "ProjectCode - MMM DD, YYYY.pdf"
"""

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import inch, cm
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Image as RLImage, Table, TableStyle, PageBreak
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from datetime import datetime
from typing import Dict, List, Any, Optional
from io import BytesIO
import base64
import logging

logger = logging.getLogger(__name__)


class DPRPDFGenerator:
    """Generate professional DPR PDF reports"""
    
    def __init__(self):
        self.page_width, self.page_height = A4
        self.margin = 0.75 * inch
        self.styles = getSampleStyleSheet()
        self._setup_custom_styles()
    
    def _setup_custom_styles(self):
        """Setup custom paragraph styles"""
        self.styles.add(ParagraphStyle(
            name='DPRTitle',
            parent=self.styles['Heading1'],
            fontSize=24,
            alignment=TA_CENTER,
            spaceAfter=20,
            textColor=colors.HexColor('#1a365d')
        ))
        
        self.styles.add(ParagraphStyle(
            name='DPRSubtitle',
            parent=self.styles['Normal'],
            fontSize=14,
            alignment=TA_CENTER,
            spaceAfter=30,
            textColor=colors.HexColor('#4a5568')
        ))
        
        self.styles.add(ParagraphStyle(
            name='SectionHeader',
            parent=self.styles['Heading2'],
            fontSize=14,
            spaceBefore=20,
            spaceAfter=10,
            textColor=colors.HexColor('#2d3748'),
            borderWidth=0,
            borderPadding=0,
            borderColor=colors.HexColor('#e2e8f0'),
        ))
        
        self.styles.add(ParagraphStyle(
            name='DPRBodyText',
            parent=self.styles['Normal'],
            fontSize=11,
            spaceAfter=8,
            leading=16,
            textColor=colors.HexColor('#2d3748')
        ))
        
        self.styles.add(ParagraphStyle(
            name='Caption',
            parent=self.styles['Normal'],
            fontSize=11,
            alignment=TA_CENTER,
            spaceBefore=10,
            spaceAfter=10,
            textColor=colors.HexColor('#4a5568'),
            leading=14
        ))
        
        self.styles.add(ParagraphStyle(
            name='PhotoNumber',
            parent=self.styles['Normal'],
            fontSize=12,
            alignment=TA_CENTER,
            spaceBefore=5,
            textColor=colors.HexColor('#718096'),
            fontName='Helvetica-Bold'
        ))
    
    def generate_pdf(
        self,
        project_data: Dict[str, Any],
        dpr_data: Dict[str, Any],
        worker_log: Optional[Dict[str, Any]],
        images: List[Dict[str, Any]]
    ) -> bytes:
        """
        Generate complete DPR PDF
        
        Args:
            project_data: Project info (name, code, etc.)
            dpr_data: DPR details (date, summary, weather, etc.)
            worker_log: Worker attendance data
            images: List of images with captions
            
        Returns:
            PDF bytes
        """
        buffer = BytesIO()
        
        doc = SimpleDocTemplate(
            buffer,
            pagesize=A4,
            rightMargin=self.margin,
            leftMargin=self.margin,
            topMargin=self.margin,
            bottomMargin=self.margin
        )
        
        story = []
        
        # Page 1: Project Details, Summary, Worker Attendance
        story.extend(self._build_page_one(project_data, dpr_data, worker_log))
        
        # Page 2+: One image per page with caption
        for idx, image in enumerate(images):
            story.append(PageBreak())
            story.extend(self._build_image_page(image, idx + 1, len(images), project_data))
        
        # Build PDF
        doc.build(story)
        
        pdf_bytes = buffer.getvalue()
        buffer.close()
        
        return pdf_bytes
    
    def _build_page_one(
        self,
        project_data: Dict[str, Any],
        dpr_data: Dict[str, Any],
        worker_log: Optional[Dict[str, Any]]
    ) -> List:
        """Build first page with project info, summary, and worker attendance"""
        elements = []
        
        # Header
        project_name = project_data.get('project_name', 'Project')
        project_code = project_data.get('project_code', 'N/A')
        
        # Title
        elements.append(Paragraph("Daily Progress Report", self.styles['DPRTitle']))
        
        # Subtitle with project and date
        dpr_date = dpr_data.get('dpr_date')
        if isinstance(dpr_date, str):
            try:
                dpr_date = datetime.fromisoformat(dpr_date.replace('Z', '+00:00'))
            except:
                dpr_date = datetime.now()
        elif not isinstance(dpr_date, datetime):
            dpr_date = datetime.now()
        
        date_str = dpr_date.strftime("%B %d, %Y")
        elements.append(Paragraph(f"{project_name} ({project_code})", self.styles['DPRSubtitle']))
        elements.append(Paragraph(date_str, self.styles['DPRSubtitle']))
        
        elements.append(Spacer(1, 20))
        
        # Project Details Section
        elements.append(Paragraph("📋 Project Details", self.styles['SectionHeader']))
        
        project_table_data = [
            ['Project Name:', project_name],
            ['Project Code:', project_code],
            ['Report Date:', date_str],
            ['Weather:', dpr_data.get('weather_conditions', 'N/A')],
            ['Supervisor:', dpr_data.get('supervisor_name', 'N/A')],
        ]
        
        project_table = Table(project_table_data, colWidths=[2*inch, 4*inch])
        project_table.setStyle(TableStyle([
            ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
            ('FONTNAME', (1, 0), (1, -1), 'Helvetica'),
            ('FONTSIZE', (0, 0), (-1, -1), 11),
            ('TEXTCOLOR', (0, 0), (0, -1), colors.HexColor('#4a5568')),
            ('TEXTCOLOR', (1, 0), (1, -1), colors.HexColor('#2d3748')),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
            ('TOPPADDING', (0, 0), (-1, -1), 8),
            ('ALIGN', (0, 0), (0, -1), 'RIGHT'),
            ('ALIGN', (1, 0), (1, -1), 'LEFT'),
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ]))
        elements.append(project_table)
        
        elements.append(Spacer(1, 20))
        
        # Voice Summary Section
        elements.append(Paragraph("📝 Progress Summary", self.styles['SectionHeader']))
        
        summary_text = dpr_data.get('progress_notes', '') or dpr_data.get('voice_summary', '')
        if summary_text:
            elements.append(Paragraph(summary_text, self.styles['DPRBodyText']))
        else:
            elements.append(Paragraph("No summary provided.", self.styles['DPRBodyText']))
        
        elements.append(Spacer(1, 20))
        
        # Worker Attendance Section
        elements.append(Paragraph("👷 Worker Attendance", self.styles['SectionHeader']))
        
        if worker_log and (worker_log.get('entries') or worker_log.get('workers')):
            entries = worker_log.get('entries', [])
            
            if entries:
                # New format with vendor entries
                worker_table_data = [['Vendor', 'Workers', 'Purpose of Work']]
                
                for entry in entries:
                    worker_table_data.append([
                        entry.get('vendor_name', 'N/A'),
                        str(entry.get('workers_count', 0)),
                        entry.get('purpose', 'N/A')
                    ])
                
                # Total row
                total_workers = sum(e.get('workers_count', 0) for e in entries)
                worker_table_data.append(['TOTAL', str(total_workers), ''])
                
                worker_table = Table(worker_table_data, colWidths=[2.5*inch, 1*inch, 3*inch])
                worker_table.setStyle(TableStyle([
                    # Header
                    ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#2d3748')),
                    ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
                    ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                    ('FONTSIZE', (0, 0), (-1, 0), 11),
                    ('ALIGN', (0, 0), (-1, 0), 'CENTER'),
                    
                    # Body
                    ('FONTNAME', (0, 1), (-1, -2), 'Helvetica'),
                    ('FONTSIZE', (0, 1), (-1, -2), 10),
                    ('ALIGN', (1, 1), (1, -1), 'CENTER'),
                    
                    # Total row
                    ('BACKGROUND', (0, -1), (-1, -1), colors.HexColor('#e2e8f0')),
                    ('FONTNAME', (0, -1), (-1, -1), 'Helvetica-Bold'),
                    
                    # Grid
                    ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#cbd5e0')),
                    ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
                    ('TOPPADDING', (0, 0), (-1, -1), 8),
                    ('LEFTPADDING', (0, 0), (-1, -1), 6),
                    ('RIGHTPADDING', (0, 0), (-1, -1), 6),
                ]))
                elements.append(worker_table)
            else:
                # Legacy format or no entries
                total = worker_log.get('total_workers', 0)
                elements.append(Paragraph(f"Total Workers: {total}", self.styles['DPRBodyText']))
        else:
            elements.append(Paragraph("No worker attendance recorded.", self.styles['DPRBodyText']))
        
        return elements
    
    def _build_image_page(
        self,
        image_data: Dict[str, Any],
        image_num: int,
        total_images: int,
        project_data: Dict[str, Any]
    ) -> List:
        """Build a page with single image and caption"""
        elements = []
        
        # Page header
        project_code = project_data.get('project_code', 'DPR')
        elements.append(Paragraph(
            f"Photo {image_num} of {total_images}",
            self.styles['PhotoNumber']
        ))
        
        elements.append(Spacer(1, 10))
        
        # Image
        image_b64 = image_data.get('image_data', '') or image_data.get('base64', '')
        
        if image_b64:
            try:
                # Remove data URL prefix if present
                if image_b64.startswith('data:'):
                    image_b64 = image_b64.split(',')[1] if ',' in image_b64 else image_b64
                
                image_bytes = base64.b64decode(image_b64)
                image_buffer = BytesIO(image_bytes)
                
                # Calculate image dimensions to fit page
                available_width = self.page_width - 2 * self.margin
                available_height = self.page_height - 3 * inch  # Leave space for header and caption
                
                # Create image with max dimensions
                img = RLImage(image_buffer)
                
                # Scale to fit
                img_width = available_width
                img_height = available_height
                
                # Maintain aspect ratio (assume portrait 9:16)
                aspect_ratio = 9 / 16
                if img_width / img_height > aspect_ratio:
                    img_width = img_height * aspect_ratio
                else:
                    img_height = img_width / aspect_ratio
                
                img._restrictSize(img_width, img_height)
                
                elements.append(img)
                
            except Exception as e:
                logger.error(f"Failed to process image: {e}")
                elements.append(Paragraph(
                    "[Image could not be processed]",
                    self.styles['Caption']
                ))
        else:
            elements.append(Paragraph(
                "[No image data]",
                self.styles['Caption']
            ))
        
        # Caption
        caption = image_data.get('caption', '') or image_data.get('ai_caption', '')
        if caption:
            elements.append(Paragraph(caption, self.styles['Caption']))
        
        return elements
    
    def get_filename(self, project_code: str, dpr_date: datetime) -> str:
        """
        Generate filename in format: "ProjectCode - MMM DD, YYYY.pdf"
        
        Example: "MCT-2025 - Feb 19, 2025.pdf"
        """
        date_str = dpr_date.strftime("%b %d, %Y")
        return f"{project_code} - {date_str}.pdf"


# Singleton instance
pdf_generator = DPRPDFGenerator()
