'use strict';

/**
 * One-page "Your AI Story" summary PDF — I.EVO header, page border, every
 * field of the story. Long stories flow onto extra pages (border + header
 * strip repeat). Returns a Buffer.
 */

const path = require('path');
const PDFDocument = require('pdfkit');

const LOGO = path.join(__dirname, '..', '..', '..', '..', 'assets', 'ievo-logo.png');
const BRAND = '#d22630';
const INK = '#1f1f1f';
const MUTED = '#6b6b6b';
const RULE = '#d9d4cc';
const MARGIN = 48;

function fmtDate(d) {
  const dt = new Date(d);
  return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
}

function buildStoryPdf(story) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margins: { top: MARGIN + 34, bottom: MARGIN + 20, left: MARGIN, right: MARGIN }, info: { Title: `Your AI Story — ${story.title}`, Author: story.submitterName } });
    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const W = doc.page.width;
    const H = doc.page.height;
    const contentW = W - MARGIN * 2;

    // The footer sits below the bottom margin; with the margin in place pdfkit
    // would treat that as overflow, add a page, and recurse via 'pageAdded'.
    const frame = (first) => {
      const bottom = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;
      doc.save();
      doc.lineWidth(1.2).strokeColor(BRAND).rect(24, 24, W - 48, H - 48).stroke();
      doc.lineWidth(0.4).strokeColor(RULE).rect(28, 28, W - 56, H - 56).stroke();
      if (!first) {
        doc.image(LOGO, MARGIN, 40, { height: 16 });
        doc.font('Helvetica').fontSize(8).fillColor(MUTED).text('Your AI Story (continued)', MARGIN, 45, { width: contentW, align: 'right' });
      }
      doc.font('Helvetica').fontSize(7.5).fillColor(MUTED)
        .text('Specula · Your AI Story · Stay Curious', MARGIN, H - 44, { width: contentW, align: 'center', lineBreak: false });
      doc.restore();
      doc.page.margins.bottom = bottom;
    };
    frame(true);
    // Fonts/colours aren't part of save()/restore(), so text continuing onto
    // the new page would inherit the frame's small grey footer style.
    doc.on('pageAdded', () => {
      frame(false);
      doc.font('Helvetica').fontSize(10.5).fillColor(INK);
      doc.x = MARGIN; doc.y = MARGIN + 34;
    });

    // ── Header ──
    doc.image(LOGO, MARGIN, 44, { height: 28 });
    doc.font('Helvetica-Bold').fontSize(9).fillColor(BRAND).text('YOUR AI STORY', MARGIN, 52, { width: contentW, align: 'right', characterSpacing: 1.5 });
    doc.moveTo(MARGIN, 84).lineTo(W - MARGIN, 84).lineWidth(0.8).strokeColor(BRAND).stroke();

    doc.y = 100; doc.x = MARGIN;
    doc.font('Helvetica-Bold').fontSize(18).fillColor(INK).text(story.title, { width: contentW });
    doc.moveDown(0.3);
    doc.font('Helvetica').fontSize(9.5).fillColor(MUTED)
      .text(`${story.submitterName}  ·  ${story.deptName}  ·  ${story.submitterEmail}  ·  ${fmtDate(story.createdAt)}`, { width: contentW });
    doc.moveDown(0.8);

    // ── Facts strip ──
    const model = story.aiModel === 'Other' ? (story.aiModelOther || 'Other') : story.aiModel;
    const impacts = [story.improvedProductivity && 'Productivity', story.improvedAccuracy && 'Accuracy'].filter(Boolean);
    const stripY = doc.y;
    doc.save().roundedRect(MARGIN, stripY, contentW, 40, 4).fillColor('#f6f3ee').fill().restore();
    const cell = (label, value, x) => {
      doc.font('Helvetica').fontSize(7.5).fillColor(MUTED).text(label.toUpperCase(), x, stripY + 8, { width: contentW / 2 - 20, characterSpacing: 0.8 });
      doc.font('Helvetica-Bold').fontSize(10.5).fillColor(INK).text(value, x, stripY + 20, { width: contentW / 2 - 20 });
    };
    cell('AI model used', model, MARGIN + 12);
    cell('Improved', impacts.length ? impacts.join(' & ') : '—', MARGIN + contentW / 2 + 6);
    doc.x = MARGIN; doc.y = stripY + 54;

    // ── Sections ──
    const section = (label, body) => {
      if (!body) return;
      if (doc.y > H - MARGIN - 90) doc.addPage();
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor(BRAND).text(label.toUpperCase(), MARGIN, doc.y, { width: contentW, characterSpacing: 1 });
      doc.moveDown(0.25);
      doc.font('Helvetica').fontSize(10.5).fillColor(INK).text(String(body), MARGIN, doc.y, { width: contentW, lineGap: 2 });
      doc.moveDown(0.9);
    };
    section('Your AI story', story.description);
    section('Daily activities handed to AI', story.dailyActivities);
    section('Deliverables produced with AI', story.deliverables);
    section('Input — what was given to the AI', story.inputDetails);
    section('Output — what came back', story.outputDetails);
    section('Impact', story.impactDescription);
    if (story.files?.length) {
      const line = (kind, label) => {
        const names = story.files.filter(f => f.kind === kind).map(f => f.originalName);
        return names.length ? `${label}: ${names.join(', ')}` : null;
      };
      section('Attached files', [line('before', 'Before'), line('after', 'After')].filter(Boolean).join('\n'));
    }

    doc.end();
  });
}

module.exports = { buildStoryPdf };
