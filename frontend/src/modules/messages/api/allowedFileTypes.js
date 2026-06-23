/**
 * Single source of truth for upload limits.
 * File type restriction removed intentionally — all file types are accepted.
 * Keep MAX_FILE_SIZE_MB in sync with Backend/.env's MAX_FILE_SIZE_MB.
 */

export const MAX_FILE_SIZE_MB  = 100;
export const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;