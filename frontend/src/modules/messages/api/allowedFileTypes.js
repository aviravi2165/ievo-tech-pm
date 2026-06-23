/**
 * Single source of truth for allowed upload MIME types.
 * Must match the ALLOWED_MIME_TYPES set in Backend/src/middleware/upload.js exactly.
 * Update both files together whenever you add or remove a type.
 */

export const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
  'text/plain',
  'text/csv',
  'application/msword',                                                           // .doc
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',     // .docx
  'application/vnd.ms-excel',                                                    // .xls
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',           // .xlsx
  'application/vnd.ms-powerpoint',                                               // .ppt
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',   // .pptx
  'application/zip',
  'application/x-zip-compressed',
]);

/** Human-readable accept string for <input type="file" accept="..."> */
export const ALLOWED_ACCEPT =
  '.jpg,.jpeg,.png,.gif,.webp,' +
  '.pdf,.txt,.csv,' +
  '.doc,.docx,' +
  '.xls,.xlsx,' +
  '.ppt,.pptx,' +
  '.zip';

export const MAX_FILE_SIZE_MB  = 25;
export const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
