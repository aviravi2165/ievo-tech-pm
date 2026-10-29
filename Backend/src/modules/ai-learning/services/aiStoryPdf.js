'use strict';

/**
 * "Your AI Story" summary PDF — I.EVO header, page border, every field of
 * the story. It is one page for a short story; a long story flows onto extra
 * pages (border + header strip repeat), so callers must not assume a page
 * count — renderStoryPdf() reports the real one.
 */

const path = require('path');
const PDFDocument = require('pdfkit');
const { toPlainText } = require('./richText');

// Specula Brand Identity Guide v1.0 — "Documents and reports": Specula on the left of the
// header, I.EVO on the right at the same visual height; Specula Navy, Inter + Space Grotesk.
const ASSETS = path.join(__dirname, '..', '..', '..', '..', 'assets');
const SPECULA_LOGO = path.join(ASSETS, 'specula-horizontal-colour-800px.png');   // from the Specula Logo Kit
const IEVO_LOGO = path.join(ASSETS, 'ievo-logo.png');
const FONTS = path.join(ASSETS, 'fonts');
const NAVY = '#334456';
const INK = '#1C2430';
const SLATE = '#4A5462';
const GREY = '#8A939F';
const LINE = '#E2E6EB';
const MIST = '#F4F6F8';
const MARGIN = 48;

function fmtDate(d) {
  const dt = new Date(d);
  return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
}

// Resolves { buffer, pages }.
function renderStoryPdf(story) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margins: { top: MARGIN + 34, bottom: MARGIN + 20, left: MARGIN, right: MARGIN }, info: { Title: `Your AI Story — ${story.title}`, Author: story.submitterName } });
    doc.registerFont('Inter', path.join(FONTS, 'Inter-Regular.ttf'));
    doc.registerFont('Inter-SemiBold', path.join(FONTS, 'Inter-SemiBold.ttf'));
    doc.registerFont('SpaceGrotesk-Medium', path.join(FONTS, 'SpaceGrotesk-Medium.ttf'));
    const chunks = [];
    let pages = 1;
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve({ buffer: Buffer.concat(chunks), pages }));
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
      doc.lineWidth(1.2).strokeColor(NAVY).rect(24, 24, W - 48, H - 48).stroke();
      doc.lineWidth(0.4).strokeColor(LINE).rect(28, 28, W - 56, H - 56).stroke();
      if (!first) {
        doc.image(SPECULA_LOGO, MARGIN - 6, 30, { height: 30 });
        doc.font('Inter').fontSize(8).fillColor(SLATE).text('Your AI Story (continued)', MARGIN, 41, { width: contentW, align: 'right' });
      }
      doc.font('Inter').fontSize(7.5).fillColor(GREY)
        .text('Specula · CTO Office Projects & Programs · Your AI Story', MARGIN, H - 44, { width: contentW, align: 'center', lineBreak: false });
      doc.restore();
      doc.page.margins.bottom = bottom;
    };
    frame(true);
    // Fonts/colours aren't part of save()/restore(), so text continuing onto
    // the new page would inherit the frame's small grey footer style.
    doc.on('pageAdded', () => {
      pages += 1;
      frame(false);
      doc.font('Inter').fontSize(10.5).fillColor(INK);
      doc.x = MARGIN; doc.y = MARGIN + 34;
    });

    // ── Header ──
    // The logo files carry their own clear space, so they sit slightly outside the text margin.
    const IEVO_H = 40;
    const IEVO_W = IEVO_H * (346 / 110);
    doc.image(SPECULA_LOGO, MARGIN - 10, 34, { height: 50 });
    doc.image(IEVO_LOGO, W - MARGIN - IEVO_W + 4, 39, { height: IEVO_H });
    doc.moveTo(MARGIN, 92).lineTo(W - MARGIN, 92).lineWidth(0.8).strokeColor(NAVY).stroke();

    doc.y = 108; doc.x = MARGIN;
    doc.font('SpaceGrotesk-Medium').fontSize(20).fillColor(NAVY).text(story.title, { width: contentW });
    doc.moveDown(0.3);
    doc.font('Inter').fontSize(9.5).fillColor(SLATE)
      .text(`${story.submitterName}  ·  ${story.deptName}  ·  ${story.submitterEmail}  ·  ${fmtDate(story.createdAt)}`, { width: contentW });
    doc.moveDown(0.8);

    // ── Facts strip ──
    const model = story.modelLabel || (story.aiModel === 'Other' ? (story.aiModelOther || 'Other') : story.aiModel);
    const impacts = [story.improvedProductivity && 'Productivity', story.improvedAccuracy && 'Accuracy'].filter(Boolean);
    const stripY = doc.y;
    doc.save().roundedRect(MARGIN, stripY, contentW, 40, 4).fillColor(MIST).fill().restore();
    const cell = (label, value, x) => {
      doc.font('Inter').fontSize(7.5).fillColor(SLATE).text(label.toUpperCase(), x, stripY + 8, { width: contentW / 2 - 20, characterSpacing: 0.8 });
      doc.font('Inter-SemiBold').fontSize(10.5).fillColor(INK).text(value, x, stripY + 20, { width: contentW / 2 - 20 });
    };
    cell('AI model used', model, MARGIN + 12);
    cell('Improved', impacts.length ? impacts.join(' & ') : '—', MARGIN + contentW / 2 + 6);
    doc.x = MARGIN; doc.y = stripY + 54;

    // ── Sections ──
    const section = (label, body) => {
      if (!body) return;
      if (doc.y > H - MARGIN - 90) doc.addPage();
      doc.font('Inter-SemiBold').fontSize(8.5).fillColor(NAVY).text(label.toUpperCase(), MARGIN, doc.y, { width: contentW, characterSpacing: 1 });
      doc.moveDown(0.25);
      doc.font('Inter').fontSize(10.5).fillColor(INK).text(String(body), MARGIN, doc.y, { width: contentW, lineGap: 2 });
      doc.moveDown(0.9);
    };
    section('Your AI story', toPlainText(story.description));
    section('Daily activities handed to AI', toPlainText(story.dailyActivities));
    section('Deliverables produced with AI', toPlainText(story.deliverables));
    section('Input — what was given to the AI', toPlainText(story.inputDetails));
    section('Output — what came back', toPlainText(story.outputDetails));
    section('Impact', toPlainText(story.impactDescription));
    if (story.files?.length) {
      // Very long names (e.g. a saved email title) are shortened in the middle, keeping the extension.
      const short = (name, max = 140) => {
        if (name.length <= max) return name;
        const ext = path.extname(name).slice(0, 8);
        return `${name.slice(0, max - ext.length - 1).trimEnd()}…${ext}`;
      };
      if (doc.y > H - MARGIN - 110) doc.addPage();
      doc.font('Inter-SemiBold').fontSize(8.5).fillColor(NAVY).text('ATTACHED FILES', MARGIN, doc.y, { width: contentW, characterSpacing: 1 });
      doc.moveDown(0.35);
      for (const [kind, label] of [['before', 'Before'], ['after', 'After']]) {
        const names = story.files.filter(f => f.kind === kind).map(f => f.originalName);
        if (!names.length) continue;
        doc.font('Inter-SemiBold').fontSize(9.5).fillColor(SLATE).text(`${label} (${names.length})`, MARGIN, doc.y, { width: contentW });
        doc.moveDown(0.15);
        for (const n of names) {
          doc.font('Inter').fontSize(9.5).fillColor(INK).text(`•  ${short(n)}`, MARGIN + 8, doc.y, { width: contentW - 8, lineGap: 1 });
        }
        doc.moveDown(0.5);
      }
    }

    doc.end();
  });
}

const buildStoryPdf = async (story) => (await renderStoryPdf(story)).buffer;

module.exports = { buildStoryPdf, renderStoryPdf };
