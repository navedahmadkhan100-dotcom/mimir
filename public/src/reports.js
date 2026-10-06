import { PDFDocument } from 'pdfkit';
import {
  AlignmentType,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun,
} from 'docx';

function safeText(value = '') {
  return String(value ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim();
}

function pathText(path = []) {
  return path.map((step) => `${step.from} -> ${step.relation} -> ${step.to}`).join(' | ');
}

function reportTitle(report) {
  return safeText(report?.structuredJd?.role_title || 'Candidate Evaluation');
}

export async function buildDocx(report) {
  const components = report?.componentBreakdown || {};
  const children = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: 'MIMIR — FIND THE WORTHY', bold: true, size: 32 })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: 'Evidence-Based Intelligent Engine', italics: true, size: 20 })],
    }),
    new Paragraph({ text: '' }),
    new Paragraph({ text: reportTitle(report), heading: HeadingLevel.HEADING_1 }),
    new Paragraph({
      children: [
        new TextRun({ text: `Overall score: ${report.finalScore ?? 0}/100`, bold: true }),
        new TextRun({ text: `    ${safeText(report.verdict)}` }),
      ],
    }),
    new Paragraph({ text: `Experience: ${components.experience ?? 0}%    Skills: ${components.skills ?? 0}%    Depth: ${components.depth ?? 0}%` }),
    new Paragraph({ text: `Audit ID: ${safeText(report.auditId)}` }),
    new Paragraph({ text: '' }),
    new Paragraph({ text: 'Evidence Matrix', heading: HeadingLevel.HEADING_1 }),
  ];

  for (const row of report.breakdownTable || []) {
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun({ text: `${safeText(row.requirement_id)} · ${safeText(row.requirement_text)}`, bold: true })],
      }),
      new Paragraph({ text: `Status: ${safeText(row.status_label)} · ${safeText(row.support_state)} · ${safeText(row.relation)}` }),
      new Paragraph({
        children: [
          new TextRun({ text: 'Evidence: ', bold: true }),
          new TextRun({ text: safeText(row.matched_quote) || 'No verified CV quote.' }),
        ],
      }),
      new Paragraph({
        children: [
          new TextRun({ text: 'Why: ', bold: true }),
          new TextRun({ text: safeText(row.reason) }),
        ],
      }),
    );
    const path = pathText(row.inference_path);
    if (path) children.push(new Paragraph({ text: `Evidence path: ${path}` }));
  }

  if (report.gateChecks?.length) {
    children.push(new Paragraph({ text: 'Verification Gates', heading: HeadingLevel.HEADING_1 }));
    for (const gate of report.gateChecks) {
      children.push(new Paragraph({ text: `${gate.status.toUpperCase()} · ${safeText(gate.requirement_text)} — ${safeText(gate.reason)}` }));
    }
  }

  if (report.verificationItems?.length) {
    children.push(new Paragraph({ text: 'Interview Verification', heading: HeadingLevel.HEADING_1 }));
    for (const item of report.verificationItems) {
      children.push(new Paragraph({ text: `${safeText(item.requirement_text)} — ${safeText(item.reason)}` }));
    }
  }

  children.push(
    new Paragraph({ text: '' }),
    new Paragraph({ text: 'Prepared with Mimir — Find the Worthy' }),
    new Paragraph({ text: 'Naved Khan · Senior IT Recruiter · navedahmedkhan100@gmail.com' }),
  );

  const document = new Document({ sections: [{ properties: {}, children }] });
  return Packer.toBuffer(document);
}

export async function buildPdf(report) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 46, info: { Title: `Mimir - ${reportTitle(report)}` } });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const heading = (text, size = 16) => {
      doc.moveDown(0.6).font('Helvetica-Bold').fontSize(size).fillColor('#121826').text(safeText(text));
    };
    const line = (label, text) => {
      doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#374151').text(`${label}: `, { continued: true });
      doc.font('Helvetica').fillColor('#374151').text(safeText(text) || '—');
    };

    doc.font('Helvetica-Bold').fontSize(21).fillColor('#111827').text('MIMIR — FIND THE WORTHY');
    doc.font('Helvetica').fontSize(10).fillColor('#6B7280').text('Evidence-Based Intelligent Engine');
    doc.moveDown(0.8);
    heading(reportTitle(report), 18);
    doc.font('Helvetica-Bold').fontSize(28).fillColor('#BE185D').text(`${report.finalScore ?? 0}/100`, { continued: true });
    doc.font('Helvetica').fontSize(12).fillColor('#374151').text(`   ${safeText(report.verdict)}`);
    const components = report.componentBreakdown || {};
    doc.fontSize(9.5).fillColor('#4B5563').text(`Experience ${components.experience ?? 0}%   •   Skills ${components.skills ?? 0}%   •   Depth ${components.depth ?? 0}%`);
    doc.fontSize(8.5).fillColor('#6B7280').text(`Audit ID: ${safeText(report.auditId)}`);

    heading('Evidence Matrix', 15);
    for (const row of report.breakdownTable || []) {
      if (doc.y > 690) doc.addPage();
      doc.moveDown(0.45);
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#111827').text(`${safeText(row.requirement_id)} · ${safeText(row.requirement_text)}`);
      doc.font('Helvetica').fontSize(8.7).fillColor('#7C3AED').text(`${safeText(row.status_label)} · ${safeText(row.support_state)} · ${safeText(row.relation)}`);
      line('Evidence', row.matched_quote || 'No verified CV quote.');
      line('Why', row.reason);
      const path = pathText(row.inference_path);
      if (path) line('Path', path);
      doc.strokeColor('#E5E7EB').moveTo(46, doc.y + 4).lineTo(549, doc.y + 4).stroke();
    }

    if (report.gateChecks?.length) {
      heading('Verification Gates', 14);
      for (const gate of report.gateChecks) line(gate.status.toUpperCase(), `${gate.requirement_text} — ${gate.reason}`);
    }

    if (report.verificationItems?.length) {
      heading('Interview Verification', 14);
      for (const item of report.verificationItems) line('VERIFY', `${item.requirement_text} — ${item.reason}`);
    }

    doc.moveDown(1);
    doc.font('Helvetica').fontSize(8.5).fillColor('#6B7280').text('Prepared with Mimir — Find the Worthy');
    doc.text('Naved Khan · Senior IT Recruiter · navedahmedkhan100@gmail.com');
    doc.end();
  });
}
