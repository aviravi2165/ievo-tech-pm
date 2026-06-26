'use strict';

const crypto = require('crypto');

/**
 * Generates a cryptographically random temporary password.
 *
 * Rules (deliberately stricter than a plain digit PIN, since this is an
 * actual account password, not a one-time numeric code):
 *   - 12 characters long
 *   - At least 1 uppercase letter
 *   - At least 1 lowercase letter
 *   - At least 1 digit
 *   - At least 1 symbol (from a safe, unambiguous set)
 *   - Excludes visually-ambiguous characters (0/O, 1/l/I) since this has to
 *     be manually read out / typed by an admin until nodemailer delivery
 *     is wired up
 *
 * Uses crypto.randomInt (cryptographically secure, unbiased) rather than
 * Math.random() or a modulo-biased byte mapping.
 */
function generateTempPassword(length = 8) {
  const UPPER   = 'ABCDEFGHJKLMNPQRSTUVWXYZ';      // no I, O
  const LOWER   = 'abcdefghijkmnopqrstuvwxyz';      // no l
  const DIGITS  = '23456789';                       // no 0, 1
  const SYMBOLS = '!@$%';

  const ALL = UPPER + LOWER + DIGITS + SYMBOLS;

  const pick = (charset) => charset[crypto.randomInt(charset.length)];

  // Guarantee one of each required category first...
  const required = [pick(UPPER), pick(LOWER), pick(DIGITS), pick(SYMBOLS)];

  // ...then fill the rest from the full combined set.
  const rest = [];
  for (let i = required.length; i < length; i++) {
    rest.push(pick(ALL));
  }

  const chars = [...required, ...rest];

  // Fisher-Yates shuffle using crypto.randomInt so the guaranteed characters
  // aren't predictably stuck in positions 0-3.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }

  return chars.join('');
}

module.exports = { generateTempPassword };