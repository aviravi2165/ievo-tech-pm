/**
 * dbHelper.js
 *
 * Provides a thin adapter that makes mssql behave like the pg (node-postgres)
 * pool.query(sql, params) interface the rest of the codebase uses.
 *
 * Key differences handled here:
 *  - pg uses positional $1..$N placeholders; mssql uses named @p1..@pN
 *  - pg returns { rows, rowCount }; we normalise to the same shape
 *  - pg pool.connect() returns a client with { query, release }; we wrap
 *    mssql transactions similarly
 *  - pg casts like $1::uuid, $1::int[], $1::uuid[], $1::timestamptz,
 *    '-infinity'::timestamptz, 'infinity'::timestamptz are stripped/replaced
 *  - ILIKE → replaced with LIKE (case-insensitive via COLLATE or just LIKE on
 *    CI collation – assumes a case-insensitive DB collation, which is the
 *    MSSQL default)
 *  - NOW() → SYSDATETIMEOFFSET()
 *  - TRUE/FALSE literals → 1/0
 *  - CONCAT(a,' ',b) stays as-is (MSSQL supports CONCAT)
 *  - STRING_AGG stays as-is (supported since SQL Server 2017)
 *  - JSON_AGG / JSON_BUILD_OBJECT → FOR JSON PATH workaround via subquery
 *  - COALESCE / NULLIF / LEFT / TRIM stay as-is
 *  - LIMIT $N OFFSET $M → OFFSET $M ROWS FETCH NEXT $N ROWS ONLY
 *  - ::int cast on COUNT(*) removed
 *  - ALTER TABLE … ADD COLUMN IF NOT EXISTS → conditional IF NOT EXISTS block
 *  - ON CONFLICT … DO NOTHING / DO UPDATE → MERGE statement
 *  - LATERAL subqueries → CROSS APPLY / OUTER APPLY
 *  - '-infinity'::timestamptz / 'infinity'::timestamptz → '1753-01-01' / '9999-12-31'
 *  - ANY($1::int[]) / ANY($1::uuid[]) → IN (values expanded inline)
 */

'use strict';

const { sql } = require('./db');

// ── SQL text transformations ──────────────────────────────────────────────────

function transformSql(pgSql, params) {
  let s = pgSql;

  // 1. Strip PG type casts from placeholders: $1::uuid → @p1
  //    Also handles $1::uuid[] $1::int[] $1::timestamptz etc.
  s = s.replace(/\$(\d+)::[\w\[\]]+/g, '@p$1');

  // 2. Replace remaining bare $N placeholders
  s = s.replace(/\$(\d+)/g, '@p$1');

  // 3. Infinity sentinels
  s = s.replace(/'[−\-]infinity'::timestamptz/gi, "'1753-01-01T00:00:00Z'");
  s = s.replace(/'infinity'::timestamptz/gi, "'9999-12-31T23:59:59Z'");

  // 4. NOW() → SYSDATETIMEOFFSET()
  s = s.replace(/\bNOW\(\)/gi, 'SYSDATETIMEOFFSET()');

  // 5. Boolean literals  TRUE → 1  FALSE → 0
  s = s.replace(/\bTRUE\b/g, '1');
  s = s.replace(/\bFALSE\b/g, '0');

  // 6. ILIKE → LIKE  (relies on case-insensitive DB collation)
  s = s.replace(/\bILIKE\b/gi, 'LIKE');

  // 7. LOWER(x) LIKE — keep as-is; MSSQL LIKE is already CI by default

  // 8. ::int cast on COUNT(*) etc. — just strip the cast
  s = s.replace(/COUNT\(\*\)::int/gi, 'COUNT(*)');
  s = s.replace(/::int\b/gi, '');
  s = s.replace(/::text\b/gi, '');
  s = s.replace(/::boolean\b/gi, '');

  // 9. LIMIT / OFFSET  →  OFFSET … ROWS FETCH NEXT … ROWS ONLY
  //    Must already have an ORDER BY.
  //    Pattern: LIMIT @pN OFFSET @pM  OR  LIMIT N OFFSET M
  s = s.replace(
    /LIMIT\s+(@p\d+|\d+)\s+OFFSET\s+(@p\d+|\d+)/gi,
    'OFFSET $2 ROWS FETCH NEXT $1 ROWS ONLY'
  );
  // LIMIT without OFFSET
  s = s.replace(/\bLIMIT\s+(\d+)\b/gi, 'OFFSET 0 ROWS FETCH NEXT $1 ROWS ONLY');

  // 10. LATERAL → CROSS/OUTER APPLY
  //     "LEFT JOIN LATERAL (...) alias ON TRUE" → "OUTER APPLY (...) alias"
  s = s.replace(/LEFT\s+JOIN\s+LATERAL\s+/gi, 'OUTER APPLY ');
  s = s.replace(/\s+ON\s+TRUE\b/gi, '');
  s = s.replace(/\bLATERAL\s+/gi, 'CROSS APPLY ');

  // 11. JSON_AGG / JSON_BUILD_OBJECT — replace with FOR JSON PATH
  //     These appear in subqueries; we rewrite each known pattern.
  s = rewriteJsonAgg(s);

  // 12. STRING_AGG — supported since SQL Server 2017; keep as-is

  // 13. COALESCE(x)::int → COALESCE(x)  (already handled by cast strip above)

  // 14. RETURNING clause — mssql uses OUTPUT; handled in execute() below

  // 15. BEGIN / COMMIT / ROLLBACK for transactions — kept; handled by wrapper

  return s;
}

/**
 * Rewrites the two specific JSON_AGG(JSON_BUILD_OBJECT(…)) subqueries used in
 * getThread/getInbox into equivalent FOR JSON PATH subqueries for MSSQL.
 *
 * This is done with targeted regex replacements because the patterns are
 * deterministic in the codebase.
 */
function rewriteJsonAgg(s) {
  // Pattern A: attachments subquery
  // JSON_AGG(JSON_BUILD_OBJECT('attachmentId', a.attachment_id, 'originalName',
  //   a.original_name, 'mimeType', a.mime_type, 'fileSize', a.file_size))
  s = s.replace(
    /JSON_AGG\s*\(\s*JSON_BUILD_OBJECT\s*\(\s*'attachmentId'\s*,\s*a\.attachment_id\s*,\s*'originalName'\s*,\s*a\.original_name\s*,\s*'mimeType'\s*,\s*a\.mime_type\s*,\s*'fileSize'\s*,\s*a\.file_size\s*\)\s*\)/gi,
    "(SELECT a.attachment_id AS attachmentId, a.original_name AS originalName, a.mime_type AS mimeType, a.file_size AS fileSize FOR JSON PATH)"
  );

  // Pattern B: read_receipts subquery
  s = s.replace(
    /JSON_AGG\s*\(\s*JSON_BUILD_OBJECT\s*\(\s*'userId'\s*,\s*rr\.user_id\s*,\s*'userName'\s*,\s*COALESCE[^,]+,\s*rr\.user_id::text\s*\)\s*,\s*'readAt'\s*,\s*rr\.read_at\s*\)\s*\)/gi,
    "(SELECT CAST(rr.user_id AS NVARCHAR(36)) AS userId, COALESCE(NULLIF(TRIM(CONCAT(ru.first_name,' ',ru.last_name)),''), ru.email, CAST(rr.user_id AS NVARCHAR(36))) AS userName, rr.read_at AS readAt FROM comm_read_receipts rr LEFT JOIN auth_users ru ON ru.user_id = rr.user_id WHERE rr.message_id = m.message_id AND rr.user_id <> m.sender_id FOR JSON PATH)"
  );

  return s;
}

// ── Expand ANY($N::type[]) → IN (v1, v2, …) inline ──────────────────────────

/**
 * mssql does not support array parameters.  For ANY($N::int[]) and
 * ANY($N::uuid[]) patterns we expand the JS array value inline as a
 * comma-separated list of named parameters @pN_0, @pN_1 … and add those
 * to the request as individual inputs.  Returns { expandedSql, extraParams }.
 */
function expandArrayParams(s, params) {
  const extraParams = {};  // { '@p3_0': value, … }

  // Match ANY(@pN) — already converted from $N::type[]
  s = s.replace(/ANY\s*\(\s*@p(\d+)\s*\)/gi, (match, idx) => {
    const value = params[parseInt(idx, 10) - 1];
    if (!Array.isArray(value)) {
      // scalar fallback — shouldn't happen but guard anyway
      return `(@p${idx})`;
    }
    const placeholders = value.map((v, i) => {
      const key = `p${idx}_${i}`;
      extraParams[key] = v;
      return `@${key}`;
    });
    // empty array → always-false predicate
    return placeholders.length ? `(${placeholders.join(', ')})` : '(NULL)';
  });

  return { expandedSql: s, extraParams };
}

// ── RETURNING clause → OUTPUT ─────────────────────────────────────────────────

/**
 * Rewrites  INSERT … VALUES (…) RETURNING col1, col2
 * to        INSERT … OUTPUT INSERTED.col1, INSERTED.col2 VALUES (…)
 *
 * Also handles UPDATE … RETURNING (→ OUTPUT INSERTED.…)
 */
function rewriteReturning(s) {
  // INSERT … VALUES (…) RETURNING …
  s = s.replace(
    /(INSERT\s+INTO\s+\S+\s*\([^)]+\))\s*(VALUES\s*\([^)]+\))\s+RETURNING\s+([^\n;]+)/gi,
    (_, insertPart, valuesPart, cols) => {
      const outputCols = cols.trim().split(',')
        .map(c => `INSERTED.${c.trim()}`).join(', ');
      return `${insertPart} OUTPUT ${outputCols} ${valuesPart}`;
    }
  );

  // UPDATE … SET … RETURNING …  (rare in this codebase but handle anyway)
  s = s.replace(
    /(UPDATE\s+\S+\s+SET\s+[^;]+?)\s+RETURNING\s+([^\n;]+)/gi,
    (_, updatePart, cols) => {
      const outputCols = cols.trim().split(',')
        .map(c => `INSERTED.${c.trim()}`).join(', ');
      return `${updatePart} OUTPUT ${outputCols}`;
    }
  );

  return s;
}

// ── ON CONFLICT → MERGE ───────────────────────────────────────────────────────

/**
 * Rewrites the specific ON CONFLICT patterns used in this codebase to
 * equivalent MERGE statements.
 *
 * Supported forms:
 *  A) INSERT INTO t (c1, c2) VALUES (@p1, @p2) ON CONFLICT (key) DO NOTHING
 *  B) INSERT INTO t (c1, c2) VALUES (@p1, @p2)
 *       ON CONFLICT (conversation_id, user_id)
 *       DO UPDATE SET col = expr, …
 *  C) INSERT INTO t (c1, c2) VALUES (@p1, @p2) ON CONFLICT DO NOTHING
 *     (no explicit key column list — uses PRIMARY KEY)
 */
function rewriteOnConflict(s) {
  // Form A & C: DO NOTHING
  // We can't write a fully generic MERGE without knowing the PK, so we use the
  // IF NOT EXISTS pattern which is semantically equivalent for unique inserts.
  s = s.replace(
    /INSERT\s+INTO\s+(\S+)\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)\s*ON\s+CONFLICT\s*(?:\([^)]*\))?\s*DO\s+NOTHING/gi,
    (_, table, cols, vals) => {
      // Build a SELECT-based existence check for each table's known conflict key
      const colList = cols.trim();
      const valList = vals.trim();
      return (
        `IF NOT EXISTS (SELECT 1 FROM ${table} WHERE ${buildExistenceCheck(table, colList, valList)})\n` +
        `  INSERT INTO ${table} (${colList}) VALUES (${valList})`
      );
    }
  );

  // Form B: DO UPDATE SET …
  s = s.replace(
    /INSERT\s+INTO\s+(\S+)\s*\(([^)]+)\)\s*\n?\s*VALUES\s*\(([^)]+)\)\s*\n?\s*ON\s+CONFLICT\s*\(([^)]+)\)\s*\n?\s*DO\s+UPDATE\s+SET\s+([\s\S]+?)(?=\n\s*(?:RETURNING|WHERE|ORDER|LIMIT|;|$)|\s*$)/gi,
    (_, table, cols, vals, conflictKey, setClauses) => {
      const colArr  = cols.trim().split(',').map(c => c.trim());
      const valArr  = vals.trim().split(',').map(v => v.trim());
      const keyArr  = conflictKey.trim().split(',').map(k => k.trim());
      const nonKey  = colArr.filter(c => !keyArr.includes(c));

      const onMatch = keyArr.map(k => {
        const idx = colArr.indexOf(k);
        return `target.${k} = ${valArr[idx]}`;
      }).join('\n    AND ');

      const insertCols = colArr.join(', ');
      const insertVals = valArr.join(', ');

      // setClauses already uses the table alias "comm_participants" etc.;
      // we replace the table name with "target"
      let setStr = setClauses.trim()
        .split(',').map(s => s.trim()).join(',\n      ');
      // strip trailing semicolons / extra whitespace
      setStr = setStr.replace(/;$/, '').trim();

      return (
        `MERGE ${table} AS target\n` +
        `USING (VALUES (${insertVals})) AS source (${insertCols})\n` +
        `ON (${onMatch})\n` +
        `WHEN MATCHED THEN UPDATE SET\n  ${setStr}\n` +
        `WHEN NOT MATCHED THEN INSERT (${insertCols}) VALUES (${insertVals})`
      );
    }
  );

  return s;
}

/**
 * Returns a WHERE predicate for the IF NOT EXISTS guard.
 * We hard-code the known unique constraints from the schema.
 */
function buildExistenceCheck(table, colList, valList) {
  const cols = colList.split(',').map(c => c.trim());
  const vals = valList.split(',').map(v => v.trim());

  const pkMap = {
    comm_group_members:       ['group_id', 'user_id'],
    comm_participants:        ['conversation_id', 'user_id'],
    comm_read_receipts:       ['message_id', 'user_id'],
    comm_group_hidden:        ['group_id', 'user_id'],
    comm_conversation_hidden: ['conversation_id', 'user_id'],
  };

  const pks = pkMap[table] || cols; // fallback: use all cols
  return pks.map(pk => {
    const idx = cols.indexOf(pk);
    return `${pk} = ${idx >= 0 ? vals[idx] : `'__unknown__'`}`;
  }).join(' AND ');
}

// ── ALTER TABLE … ADD COLUMN IF NOT EXISTS ───────────────────────────────────

function rewriteAlterAddColumnIfNotExists(s) {
  return s.replace(
    /ALTER\s+TABLE\s+(\S+)\s*\n?\s*ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+(\S+)\s+(\S+)\s*;?/gi,
    (_, table, col, type) => {
      const mssqlType = pgTypeToMssql(type);
      return (
        `IF NOT EXISTS (\n` +
        `  SELECT 1 FROM sys.columns\n` +
        `  WHERE object_id = OBJECT_ID('${table}') AND name = '${col}'\n` +
        `)\n` +
        `  ALTER TABLE ${table} ADD ${col} ${mssqlType}`
      );
    }
  );
}

function pgTypeToMssql(pgType) {
  const map = {
    TIMESTAMPTZ:   'DATETIMEOFFSET',
    TIMESTAMP:     'DATETIME2',
    TEXT:          'NVARCHAR(MAX)',
    VARCHAR:       'NVARCHAR(MAX)',
    BOOLEAN:       'BIT',
    BOOL:          'BIT',
    INTEGER:       'INT',
    BIGINT:        'BIGINT',
    UUID:          'UNIQUEIDENTIFIER',
  };
  return map[pgType.toUpperCase()] || pgType;
}

// ── Core query executor ───────────────────────────────────────────────────────

/**
 * Executes a pg-style query (positional $N params, pg SQL dialects) against
 * mssql, returning { rows, rowCount } to match the pg interface.
 *
 * @param {import('mssql').ConnectionPool | import('mssql').Transaction} conn
 * @param {string} pgSql
 * @param {any[]} [params=[]]
 */
async function execute(conn, pgSql, params = []) {
  let s = pgSql.trim();

  // Detect ALTER TABLE pattern before general transforms
  if (/ALTER\s+TABLE/i.test(s)) {
    s = rewriteAlterAddColumnIfNotExists(s);
    // Execute as a raw batch (no params, no RETURNING)
    const req = conn.request ? conn.request() : conn;
    await req.batch(s);
    return { rows: [], rowCount: 0 };
  }

  s = transformSql(s, params);

  // Expand array params (ANY($N))
  const { expandedSql, extraParams } = expandArrayParams(s, params);
  s = expandedSql;

  // Rewrite RETURNING → OUTPUT (must be before ON CONFLICT rewrite)
  const hasReturning = /RETURNING/i.test(pgSql);
  s = rewriteReturning(s);

  // Rewrite ON CONFLICT
  s = rewriteOnConflict(s);

  // Build mssql request
  const request = conn.request ? conn.request() : conn;

  // Bind positional parameters
  params.forEach((value, idx) => {
    const name = `p${idx + 1}`;
    bindParam(request, name, value);
  });

  // Bind extra params from array expansion
  for (const [name, value] of Object.entries(extraParams)) {
    bindParam(request, name, value);
  }

  // Choose execute vs batch
  let result;
  console.log('\n===== MSSQL QUERY =====');
console.log(s);
console.log('PARAMS:', params);
console.log('=======================\n');

if (/^(IF\s|MERGE\s|BEGIN\s*$|COMMIT\s*$|ROLLBACK\s*$)/i.test(s.trim())) {
  result = await request.batch(s);
} else {
  result = await request.query(s);
}

  const rows = result.recordset || [];
  const rowCount = result.rowsAffected
    ? result.rowsAffected.reduce((a, b) => a + b, 0)
    : rows.length;

  return { rows, rowCount };
}

function bindParam(request, name, value) {
  if (value === null || value === undefined) {
    request.input(name, sql.NVarChar, null);
  } else if (typeof value === 'boolean') {
    request.input(name, sql.Bit, value ? 1 : 0);
  } else if (typeof value === 'number' && Number.isInteger(value)) {
    request.input(name, sql.Int, value);
  } else if (typeof value === 'number') {
    request.input(name, sql.Float, value);
  } else if (value instanceof Date) {
    request.input(name, sql.DateTimeOffset, value);
  } else if (Array.isArray(value)) {
    // Arrays are handled by expandArrayParams; if we reach here it's a
    // scalar context — stringify as a safety fallback
    request.input(name, sql.NVarChar, JSON.stringify(value));
  } else {
    request.input(name, sql.NVarChar, String(value));
  }
}

// ── pg-compatible pool wrapper ────────────────────────────────────────────────

const { getPool } = require('./db');

/**
 * Returns a pg-compatible pool-like object.
 * Usage: const pool = await getMssqlPool();  pool.query(sql, params)
 */
async function getMssqlPool() {
  const pool = await getPool();

  return {
    query: (pgSql, params) => execute(pool, pgSql, params),

    /**
     * Mimics pg's pool.connect() → client with { query, release }.
     * We wrap an mssql Transaction so BEGIN/COMMIT/ROLLBACK work.
     */
    connect: async () => {
      const transaction = new sql.Transaction(pool);
      await transaction.begin();

      let released = false;

      const client = {
        query: async (pgSql, params) => {
          if (/^\s*BEGIN\s*$/i.test(pgSql))    return { rows: [], rowCount: 0 };
          if (/^\s*COMMIT\s*$/i.test(pgSql))   { await transaction.commit(); return { rows: [], rowCount: 0 }; }
          if (/^\s*ROLLBACK\s*$/i.test(pgSql)) { await transaction.rollback(); return { rows: [], rowCount: 0 }; }
          const req = transaction.request();
          return execute(req, pgSql, params);
        },
        batch: async (batchSql) => {
          const req = transaction.request();
          await req.batch(batchSql);
          return { rows: [], rowCount: 0 };
        },
        release: async () => {
          if (!released) {
            released = true;
            // If transaction wasn't explicitly committed/rolled back, roll back
            try { await transaction.rollback(); } catch (_) {}
          }
        },
      };
      return client;
    },
  };
}

module.exports = { getMssqlPool };
