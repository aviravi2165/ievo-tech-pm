'use strict';

/**
 * Reference code of a submission, e.g. IRAJ-BD-SI-26-0012
 *
 *   IRAJ  the company
 *   BD    the department, two letters ("Business Development" -> BD)
 *   SI    what was submitted: SI = an AI story, ST = a tech post
 *   26    the year it was submitted (YY)
 *   0012  the submission's own id (unique within its kind, so the code is unique)
 *
 * Nothing is stored: the code is worked out from the department name, the submission's
 * created date and its id, so it needs no database change.
 */

const COMPANY = 'IRAJ';
const KINDS = { story: 'SI', tech: 'ST' };
const SKIP_WORDS = new Set(['and', 'of', 'the', 'for']);

/** Two letters for a department: first letters of its first two words, else the first two letters. */
function deptCode(name) {
  const words = String(name ?? '')
    .split(/[^A-Za-z0-9]+/)
    .filter(w => w && !SKIP_WORDS.has(w.toLowerCase()));
  const code = words.length >= 2 ? words[0][0] + words[1][0] : (words[0] || '').slice(0, 2);
  return code.toUpperCase().padEnd(2, 'X');
}

function refCode({ kind, deptName, createdAt, id }) {
  const d = createdAt ? new Date(createdAt) : new Date();
  const yy = String((Number.isNaN(d.getTime()) ? new Date() : d).getFullYear()).slice(-2);
  return `${COMPANY}-${deptCode(deptName)}-${KINDS[kind]}-${yy}-${String(id).padStart(4, '0')}`;
}

/**
 * Admin search: a typed reference code (IRAJ-BD-SI-26-0012) points at one submission.
 * Returns { id } when `text` is a code of this `kind`, else null.
 */
function idFromRefCode(text, kind) {
  const m = new RegExp(`^${COMPANY}-[A-Z0-9]{2}-${KINDS[kind]}-\\d{2}-(\\d+)$`, 'i').exec(String(text ?? '').trim());
  return m ? { id: Number(m[1]) } : null;
}

module.exports = { deptCode, refCode, idFromRefCode };
