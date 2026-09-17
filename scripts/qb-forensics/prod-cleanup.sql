-- scripts/qb-forensics/prod-cleanup.sql
-- ----------------------------------------------------------------------------
-- PostgreSQL mirror of scripts/clean-broken-questions.ts (buildRemovalPlan) so
-- a production DBA can delete every broken MCQ via psql WITHOUT giving the
-- agent a DATABASE_URL.
--
-- "Broken" = the SAME import-gate policy as scripts/qb-forensics/import-gate.ts:
--   1. UNICODE_CORRUPTION  — replacement char, mojibake / double-encoded UTF-8,
--      control/invisible chars, visual-order / cluster-split Bangla,
--      mangled "ব্যাখ্যা" header, option-marker leak into an option.
--   2. STRUCTURAL_BROKEN   — <4 options, empty option, empty question/answer,
--      answer that matches no option (and is not a resolvable letter).
--   3. EMPTY_EXPLANATION   — question-bank policy: explanations are mandatory.
--   4. DUPLICATE           — duplicate of a kept row by normalized
--      (question | correctAnswer | explanation); oldest (MIN id) kept.
--
-- Known deviations from the TS gate (both CONSERVATIVE, tiny in practice):
--   • No NFC composition (Postgres has no built-in NFC; stored rows are
--     practically always already NFC).
--   • Literal `\n`/`\t` escape decoding is skipped.
--   • case/width differences collapse via a simplified Latin+Bangla alphabet set.
-- Run the plan (dry-run, NO writes) first:
--     psql "$DATABASE_URL" -f scripts/qb-forensics/prod-cleanup.sql
-- After reviewing the plan, apply (backup-tables + transactional delete):
--     psql "$DATABASE_URL" -v apply=1 -f scripts/qb-forensics/prod-cleanup.sql
-- ALWAYS take a pg_dump before applying:
--     pg_dump "$DATABASE_URL" -f /tmp/prod-pre-cleanup.sql
--
-- The DELETE only removes Question rows; Bookmark + UserQuestionProgress
-- cascade (verified against schema: Question.bookmarks / userProgress
-- onDelete: Cascade) and QuestionAttempt.questionId is SetNull.
-- ----------------------------------------------------------------------------

-- ── Helpers (idempotent) ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION norm_text(p text)
RETURNS text LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  v text := coalesce(p, '');
BEGIN
  v := regexp_replace(v, '&amp;', '&', 'g');
  v := regexp_replace(v, '&lt;', '<', 'g');
  v := regexp_replace(v, '&gt;', '>', 'g');
  v := regexp_replace(v, '&quot;', '"', 'g');
  v := regexp_replace(v, '&apos;', '''', 'g');
  v := regexp_replace(v, '&#39;', '''', 'g');
  v := regexp_replace(v, '[\u00A0\u1680\u2028\u2029\u202F\u205F\u3000\u2027\t\r\f\v]', ' ', 'g');
  v := regexp_replace(v, ' {2,}', ' ', 'g');
  RETURN btrim(v, ' \uFEFF');
END;
$$;

CREATE OR REPLACE FUNCTION has_replacement_char(t text)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT strpos(coalesce(t, ''), '�') > 0;
$$;

CREATE OR REPLACE FUNCTION has_mojibake(t text)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT coalesce(t, '') ~
    'Ã[©¨ª°±²³µ¶·¸¹º»¼½¾¿À-ÿ]|â€[™"˜\u0093\u0094\u0098\u0099]|â€™|â€œ|â€\u009d|â€"|â€¦|[ÃÂ]{2,}|Ð[°±²³µ¶·¸¹º»¼½¾Ñ-ÿ]|Ñ[‹›«»¿À-ÿ]|\u00C3[\u0080-\u00BF]';
$$;

CREATE OR REPLACE FUNCTION has_double_encoding(t text)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT coalesce(t, '') ~ '\u00C3[\u0080-\u00BF]|\u00C2[\u0080-\u00BF]';
$$;

CREATE OR REPLACE FUNCTION has_control_chars(t text)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT coalesce(t, '') ~ '[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\uFEFF\u200B\u2060\u00AD]';
$$;

-- Bangla base class: অ-ঔ (0985-0994), ক-হ (0995-09B9), ড় ঢ় য় (09DD-09DF)
-- hasMangleSignature: visual-order / cluster-split corruption.
CREATE OR REPLACE FUNCTION has_mangle(t text)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT coalesce(t, '') ~ '[অ-ঔক-হ\u09DD\u09DE\u09DF]'
    AND coalesce(t, '') ~ (
      '(^|[[:space:](:{])[িেৈোৌ]'
      || '|[ক-হ\u09DD\u09DE\u09DF][[:space:]]র্'
      || '|[[:space:]]র্[[:space:]]'
      || '|্[[:space:]][অ-ঔক-হ\u09DD\u09DE\u09DF]'
      || '|[\u09BE\u09BF\u09C0\u09C1\u09C2\u09C3][\u09C7\u09C8\u09CB\u09CC]'
    );
$$;

CREATE OR REPLACE FUNCTION has_mangled_header(t text)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT coalesce(t, '') ~ 'বযাখ্যা|বয্াখয্া|বযাখয্া';
$$;

CREATE OR REPLACE FUNCTION has_option_markers(t text)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT coalesce(t, '') ~ '\((ক|খ|গ|ঘ|ঙ|চ)\)';
$$;

-- A field is corrupt on ANY of the fatal unicode checks (checks run on the raw
-- value for replacement chars and on the normalized value otherwise — same as
-- scanMca).
CREATE OR REPLACE FUNCTION corrupt_text(p_raw text, p_norm text)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT has_replacement_char(p_raw)
      OR has_mojibake(p_norm)
      OR has_double_encoding(p_norm)
      OR has_control_chars(p_norm)
      OR has_mangle(p_norm)
      OR has_mangled_header(p_norm);
$$;

-- Resolve a letter-answer ("(গ)", "ঘ।", "C.", "b:") to (0-based idx, rest).
CREATE OR REPLACE FUNCTION resolve_letter_answer(p_ans text)
RETURNS TABLE (idx int, rest text) LANGUAGE sql IMMUTABLE AS $$
  WITH m AS (
    SELECT
      CASE
        WHEN p_ans ~ '^\((ক|খ|গ|ঘ|ঙ)\)'    THEN (regexp_match(p_ans, '^\((ক|খ|গ|ঘ|ঙ)\)'))[1]
        WHEN p_ans ~ '^[কখগঘঙ][।.]'        THEN left(p_ans, 1)
        WHEN p_ans ~ '^\(?[A-Da-d]\)?[\.:]'  THEN (regexp_match(p_ans, '^\(?([A-Da-d])\)?[\.:]'))[1]
        ELSE NULL
      END AS letter,
      CASE
        WHEN p_ans ~ '^\((ক|খ|গ|ঘ|ঙ)\)'    THEN regexp_replace(substring(p_ans, 4), '^[।.\s]+', '')
        WHEN p_ans ~ '^[কখগঘঙ][।.]'        THEN regexp_replace(substring(p_ans, 2), '^[।.\s:]+', '')
        WHEN p_ans ~ '^\(?[A-Da-d]\)?[\.:]' THEN regexp_replace(substring(lower(p_ans), 2), '^[।.\s()]*', '')
        ELSE NULL
      END AS rest
  )
  SELECT
    CASE
      WHEN m.letter ~ '[কখগঘঙ]' THEN strpos('কখগঘঙ', m.letter) - 1
      WHEN m.letter ~ '[a-d]'    THEN strpos('abcd', lower(m.letter)) - 1
      ELSE NULL
    END AS idx,
    m.rest
  FROM m
  WHERE m.letter IS NOT NULL;
$$;

-- Duplicate signature: normalized lowercased text, zero-width/space removed,
-- non (letter|number|Bangla) runs collapsed to a single space (≈ dupSignature).
CREATE OR REPLACE FUNCTION dup_norm(p text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT btrim(
    regexp_replace(
      regexp_replace(
        lower(coalesce(p, '')),
      '[\u00A0\u200B\u200C\u200D\uFEFF]', '', 'g'),
    '[^a-z0-9\u0980-\u09FF]+', ' ', 'g'));
$$;

-- ── Build the removal plan (read-only until the \if apply block below) ──────
DROP TABLE IF EXISTS _opts;
CREATE TEMP TABLE _opts AS
  SELECT q.id, o.opt, o.ord, norm_text(o.opt) AS opt_norm
  FROM "Question" q,
       LATERAL jsonb_array_elements_text(q."options"::jsonb) WITH ORDINALITY AS o(opt, ord);

DROP TABLE IF EXISTS _opt_agg;
CREATE TEMP TABLE _opt_agg AS
  SELECT id,
    count(*)                              AS opt_count,
    bool_or(opt = '')                     AS has_empty_opt,
    bool_or(has_option_markers(opt_norm)) AS has_marker_leak,
    bool_or(corrupt_text(opt, opt_norm))  AS opt_corrupt,
    array_agg(opt_norm ORDER BY ord)      AS norm_opts
  FROM _opts
  GROUP BY id;

DROP TABLE IF EXISTS _fields;
CREATE TEMP TABLE _fields AS
  WITH n AS (
    SELECT q.id, q."subjectId", q.topic, q.subtopic, q.path,
      q.question                     AS q_raw,
      q."correctAnswer"              AS a_raw,
      q.explanation                  AS e_raw,
      norm_text(q.question)           AS qn,
      norm_text(q."correctAnswer")    AS an,
      norm_text(q.explanation)        AS en
    FROM "Question" q
  ),
  f AS (
    SELECT n.*, o.opt_count, o.has_empty_opt, o.has_marker_leak, o.opt_corrupt, o.norm_opts,
      corrupt_text(n.q_raw, n.qn) AS q_corr,
      corrupt_text(n.a_raw, n.an) AS a_corr,
      corrupt_text(n.e_raw, n.en) AS e_corr
    FROM n LEFT JOIN _opt_agg o ON o.id = n.id
  )
  SELECT f.*,
    (f.qn = '')                                              AS empty_question,
    COALESCE(f.opt_count, 0) < 4                             AS wrong_opt_count,
    COALESCE(f.has_empty_opt, FALSE)                         AS empty_opt,
    (f.an = '')                                              AS empty_answer,
    (f.en = '')                                              AS empty_explanation,
    (f.an <> ''
      AND COALESCE(f.opt_count, 0) >= 2
      AND NOT (f.an = ANY(f.norm_opts))
      AND NOT EXISTS (
        SELECT 1 FROM resolve_letter_answer(f.an) r
        WHERE r.idx < COALESCE(f.opt_count, 0)
          AND (r.rest = '' OR r.rest = f.norm_opts[r.idx + 1])
      ))                                                     AS answer_mismatch
  FROM f;

DROP TABLE IF EXISTS _plan;
CREATE TEMP TABLE _plan AS
  SELECT fl.id, fl."subjectId", fl.topic, fl.subtopic, fl.path,
    (fl.q_corr OR fl.a_corr OR fl.e_corr OR fl.opt_corrupt OR fl.has_marker_leak) AS corruption,
    (fl.empty_question OR fl.wrong_opt_count OR fl.empty_opt OR fl.empty_answer OR fl.answer_mismatch) AS structural_other,
    fl.empty_explanation,
    fl.empty_question, fl.wrong_opt_count, fl.empty_opt, fl.empty_answer, fl.answer_mismatch,
    CASE
      WHEN fl.q_corr OR fl.a_corr OR fl.e_corr OR fl.opt_corrupt OR fl.has_marker_leak THEN 'UNICODE_CORRUPTION'
      WHEN fl.empty_explanation AND NOT (fl.empty_question OR fl.wrong_opt_count OR fl.empty_opt OR fl.empty_answer OR fl.answer_mismatch) THEN 'EMPTY_EXPLANATION'
      WHEN fl.empty_question OR fl.wrong_opt_count OR fl.empty_opt OR fl.empty_answer OR fl.answer_mismatch THEN 'STRUCTURAL_BROKEN'
      ELSE NULL
    END AS reason,
    concat_ws(',',
      CASE WHEN fl.q_corr THEN 'q' END,
      CASE WHEN fl.a_corr THEN 'ans' END,
      CASE WHEN fl.e_corr THEN 'exp' END,
      CASE WHEN fl.opt_corrupt OR fl.has_marker_leak THEN 'opt' END,
      CASE WHEN fl.empty_question THEN 'empty-q' END,
      CASE WHEN fl.wrong_opt_count THEN 'lt4-opt' END,
      CASE WHEN fl.empty_opt THEN 'empty-opt' END,
      CASE WHEN fl.empty_answer THEN 'empty-ans' END,
      CASE WHEN fl.answer_mismatch THEN 'mismatch' END,
      CASE WHEN fl.empty_explanation THEN 'empty-exp' END
    ) AS flags
  FROM _fields fl;

-- Duplicates are computed among the rows that PASS the gate (kept), keeping the
-- OLDEST id per normalized (question|correctAnswer|explanation) signature.
DROP TABLE IF EXISTS _dups;
CREATE TEMP TABLE _dups AS
  WITH kept AS (
    SELECT * FROM _plan WHERE reason IS NULL
  ),
  sig AS (
    SELECT k.id,
      concat_ws('|',
        dup_norm(q.question),
        dup_norm(q."correctAnswer"),
        dup_norm(q.explanation)) AS s
    FROM kept k JOIN "Question" q ON q.id = k.id
  ),
  best AS (
    SELECT s, min(id) AS keep_id, count(*) AS n
    FROM sig GROUP BY s HAVING count(*) > 1
  )
  SELECT s.id, best.keep_id, best.n
  FROM sig s JOIN best ON best.s = s.s
  WHERE s.id <> best.keep_id;

DROP TABLE IF EXISTS _removal;
CREATE TEMP TABLE _removal AS
  SELECT id, reason, NULL::bigint AS keep_id
  FROM _plan WHERE reason IS NOT NULL
  UNION ALL
  SELECT id, 'DUPLICATE'::text AS reason, keep_id
  FROM _dups;

-- ── PLAN / DRY-RUN REPORT (safe — no writes) ────────────────────────────────
\echo '=== CLEANUP PLAN: summary by reason ==='
SELECT reason, count(*) AS questions
FROM _removal GROUP BY reason ORDER BY questions DESC;

\echo '=== CLEANUP PLAN: by subjectId ==='
SELECT r.reason, q."subjectId", count(*) AS questions
FROM _removal r JOIN "Question" q ON q.id = r.id
GROUP BY r.reason, q."subjectId" ORDER BY r.reason, q."subjectId";

\echo '=== CLEANUP PLAN: full row list ==='
SELECT r.id, r.reason, r.keep_id,
       COALESCE(NULLIF(p.flags, ''), '-') AS flags,
       s."nameBn" AS subject, p.topic, p.subtopic
FROM _removal r
JOIN _plan p ON p.id = r.id
LEFT JOIN "Subject" s ON s.id = p."subjectId"
ORDER BY r.id;

\echo '=== CLEANUP PLAN: totals ==='
SELECT
  (SELECT count(*) FROM "Question")              AS questions_in_db,
  (SELECT count(*) FROM _removal)                AS to_remove,
  (SELECT count(*) FROM "Question")
    - (SELECT count(*) FROM _removal)            AS will_remain;

-- ── APPLY (guarded: only runs when psql invoked with  -v apply=1 ) ───────────
\if :{?apply}
\echo '=== APPLYING: backup + transactional delete ==='
BEGIN;

CREATE TABLE IF NOT EXISTS _cleanup_backup_questions AS
  SELECT * FROM "Question" WHERE id IN (SELECT id FROM _removal);
CREATE TABLE IF NOT EXISTS _cleanup_backup_bookmarks AS
  SELECT * FROM "Bookmark" WHERE "questionId" IN (SELECT id FROM _removal);
CREATE TABLE IF NOT EXISTS _cleanup_backup_progress AS
  SELECT * FROM "UserQuestionProgress" WHERE "questionId" IN (SELECT id FROM _removal);

\echo 'Backup rows:'
SELECT
  (SELECT count(*) FROM _cleanup_backup_questions) AS questions,
  (SELECT count(*) FROM _cleanup_backup_bookmarks) AS bookmarks,
  (SELECT count(*) FROM _cleanup_backup_progress) AS progress;

DELETE FROM "Question" WHERE id IN (SELECT id FROM _removal);

\echo 'Remaining rows referencing removed questions (should be 0 / 0):'
SELECT
  (SELECT count(*) FROM "Question" WHERE id IN (SELECT id FROM _removal)) AS questions_remaining;

COMMIT;

\echo '=== APPLIED. Run the file again WITHOUT  -v apply=1  to confirm the plan is now empty. ==='
\endif