import { PDFDocument } from 'pdfkit';
import sharp from 'sharp';
import {
  AlignmentType,
  Document,
  HeadingLevel,
  ImageRun,
  Packer,
  PageBreak,
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

function evidenceText(row = {}) {
  if (row.evidence_source_type === 'visual' && row.visual_observation) {
    const source = [row.visual_asset_id, row.source_page ? `page ${row.source_page}` : null].filter(Boolean).join(' · ');
    return `${source ? `[Visual ${source}] ` : '[Visual] '}${safeText(row.visual_observation)}`;
  }
  return safeText(row.matched_quote) || 'No verified CV evidence.';
}

/**
 * Split a captured result UI into page-shaped image slices. The screenshot is already
 * the exact browser rendering, so PDF/DOCX can preserve the same visual hierarchy.
 */
async function splitUiImage(imageBuffer, pageAspect = 1.44) {
  const meta = await sharp(imageBuffer).metadata();
  const width = Number(meta.width || 0);
  const height = Number(meta.height || 0);
  if (!width || !height) throw new Error('Unable to read captured result image.');

  const pageHeight = Math.max(1, Math.floor(width * pageAspect));
  const slices = [];
  for (let top = 0; top < height; top += pageHeight) {
    const sliceHeight = Math.min(pageHeight, height - top);
    const buffer = await sharp(imageBuffer)
      .extract({ left: 0, top, width, height: sliceHeight })
      .jpeg({ quality: 92, chromaSubsampling: '4:4:4' })
      .toBuffer();
    slices.push({ buffer, width, height: sliceHeight });
  }
  return slices;
}

export async function buildUiPdf(imageBuffer) {
  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const margin = 18;
  const contentWidth = pageWidth - (margin * 2);
  const contentHeight = pageHeight - (margin * 2);
  const slices = await splitUiImage(imageBuffer, contentHeight / contentWidth);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 0, autoFirstPage: false });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    for (const slice of slices) {
      doc.addPage({ size: 'A4', margin: 0 });
      doc.rect(0, 0, pageWidth, pageHeight).fill('#070711');
      const ratio = slice.height / slice.width;
      const fittedHeight = Math.min(contentHeight, contentWidth * ratio);
      doc.image(slice.buffer, margin, margin, {
        width: contentWidth,
        height: fittedHeight,
        align: 'center',
        valign: 'top',
      });
    }
    doc.end();
  });
}

export async function buildUiDocx(imageBuffer) {
  const slices = await splitUiImage(imageBuffer, 1.43);
  const children = [];
  const targetWidth = 710;

  slices.forEach((slice, index) => {
    if (index > 0) children.push(new Paragraph({ children: [new PageBreak()] }));
    const targetHeight = Math.round(targetWidth * (slice.height / slice.width));
    children.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new ImageRun({
        data: slice.buffer,
        transformation: { width: targetWidth, height: targetHeight },
        type: 'jpg',
      })],
    }));
  });

  const document = new Document({
    sections: [{
      properties: {
        page: {
          margin: { top: 180, right: 180, bottom: 180, left: 180 },
        },
      },
      children,
    }],
  });
  return Packer.toBuffer(document);
}

// Structured fallbacks remain available if browser-side UI capture is blocked.
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
    new Paragraph({ text: 'Proof Matrix', heading: HeadingLevel.HEADING_1 }),
  ];

  for (const row of report.breakdownTable || []) {
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun({ text: `${safeText(row.requirement_id)} · ${safeText(row.requirement_text)}`, bold: true })],
      }),
      new Paragraph({ text: `Status: ${safeText(row.status_label)} · claim ${safeText(row.claim_state || '—')} · ${safeText(row.support_state)} · ${safeText(row.relation)}` }),
      new Paragraph({
        children: [
          new TextRun({ text: 'Evidence: ', bold: true }),
          new TextRun({ text: evidenceText(row) }),
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
    if (row.score_lineage) children.push(new Paragraph({ text: `Score lineage: base ${row.score_lineage.base_points} · policy cap ${row.score_lineage.policy_cap} · final credit ${row.score_lineage.credit_after_policy} · contribution ${row.score_lineage.final_score_points ?? 0} points` }));
  }

  if (report.jdAudit?.issues?.length) {
    children.push(new Paragraph({ text: 'JD Requirement Audit', heading: HeadingLevel.HEADING_1 }));
    for (const item of report.jdAudit.issues) children.push(new Paragraph({ text: `${safeText(item.requirement_id || 'JD')} · ${safeText(item.code)} — ${safeText(item.message)}` }));
  }

  if (report.claimAssessments?.length) {
    children.push(new Paragraph({ text: 'Claim Entailment', heading: HeadingLevel.HEADING_1 }));
    for (const claim of report.claimAssessments) {
      children.push(new Paragraph({ text: `${safeText(claim.requirement_id)} · ${safeText(claim.state)} — ${safeText(claim.statement)}` }));
      if (claim.not_established?.length) children.push(new Paragraph({ text: `Boundary: ${safeText(claim.not_established.join(' · '))}` }));
      if (claim.what_would_change?.length) children.push(new Paragraph({ text: `What would change this: ${safeText(claim.what_would_change.join(' · '))}` }));
    }
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
  if (report.odinChallenges?.length) {
    children.push(new Paragraph({ text: 'Odin Adversarial Review', heading: HeadingLevel.HEADING_1 }));
    for (const item of report.odinChallenges) children.push(new Paragraph({ text: `${safeText(item.requirement_id)} · ${safeText(item.code)} — ${safeText(item.challenge)}` }));
  }

  if (report.nextBestVerificationQuestions?.length) {
    children.push(new Paragraph({ text: 'Next-Best Verification Questions', heading: HeadingLevel.HEADING_1 }));
    for (const item of report.nextBestVerificationQuestions) children.push(new Paragraph({ text: `${safeText(item.requirement_id)} — ${safeText(item.question)}` }));
  }

  if (report.governance) {
    children.push(new Paragraph({ text: 'Governance', heading: HeadingLevel.HEADING_1 }));
    children.push(new Paragraph({ text: `Human oversight: ${report.governance.human_oversight_required ? 'Required' : 'No'} · Automated final decision: ${report.governance.automated_final_decision ? 'Yes' : 'No'} · Auto rejection: ${report.governance.automated_rejection_permitted ? 'Permitted' : 'Disabled'}` }));
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

    heading('Proof Matrix', 15);
    for (const row of report.breakdownTable || []) {
      if (doc.y > 690) doc.addPage();
      doc.moveDown(0.45);
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#111827').text(`${safeText(row.requirement_id)} · ${safeText(row.requirement_text)}`);
      doc.font('Helvetica').fontSize(8.7).fillColor('#7C3AED').text(`${safeText(row.status_label)} · claim ${safeText(row.claim_state || '—')} · ${safeText(row.support_state)} · ${safeText(row.relation)}`);
      line('Evidence', evidenceText(row));
      line('Why', row.reason);
      const path = pathText(row.inference_path);
      if (path) line('Path', path);
      if (row.score_lineage) line('Score lineage', `base ${row.score_lineage.base_points} · policy cap ${row.score_lineage.policy_cap} · final credit ${row.score_lineage.credit_after_policy} · contribution ${row.score_lineage.final_score_points ?? 0} points`);
      doc.strokeColor('#E5E7EB').moveTo(46, doc.y + 4).lineTo(549, doc.y + 4).stroke();
    }

    if (report.jdAudit?.issues?.length) {
      heading('JD Requirement Audit', 14);
      for (const item of report.jdAudit.issues) line(item.code || 'JD', `${item.requirement_id || 'JD'} — ${item.message}`);
    }

    if (report.claimAssessments?.length) {
      heading('Claim Entailment', 14);
      for (const claim of report.claimAssessments) {
        line(`${claim.requirement_id} · ${claim.state}`, claim.statement);
        if (claim.not_established?.length) line('Boundary', claim.not_established.join(' · '));
        if (claim.what_would_change?.length) line('What would change this', claim.what_would_change.join(' · '));
      }
    }

    if (report.gateChecks?.length) {
      heading('Verification Gates', 14);
      for (const gate of report.gateChecks) line(gate.status.toUpperCase(), `${gate.requirement_text} — ${gate.reason}`);
    }

    if (report.verificationItems?.length) {
      heading('Interview Verification', 14);
      for (const item of report.verificationItems) line('VERIFY', `${item.requirement_text} — ${item.reason}`);
    }

    if (report.odinChallenges?.length) {
      heading('Odin Adversarial Review', 14);
      for (const item of report.odinChallenges) line(item.code || 'ODIN', `${item.requirement_id} — ${item.challenge}`);
    }
    if (report.nextBestVerificationQuestions?.length) {
      heading('Next-Best Verification Questions', 14);
      for (const item of report.nextBestVerificationQuestions) line(item.requirement_id || 'VERIFY', item.question);
    }
    if (report.governance) {
      heading('Governance', 14);
      line('Decision', report.governance.automated_final_decision ? 'Automated' : 'Human-controlled');
      line('Human oversight', report.governance.human_oversight_required ? 'Required' : 'No');
      line('Auto rejection', report.governance.automated_rejection_permitted ? 'Permitted' : 'Disabled');
    }

    doc.moveDown(1);
    doc.font('Helvetica').fontSize(8.5).fillColor('#6B7280').text('Prepared with Mimir — Find the Worthy');
    doc.text('Naved Khan · Senior IT Recruiter · navedahmedkhan100@gmail.com');
    doc.end();
  });
}
