import type { DatabaseSync } from 'node:sqlite';
import { sanitizeEditorialHtml } from '../lib/editorialRules';
import {
  classifyArticleCategory,
  isPredominantlyEnglish,
  paraphraseHeadline,
  paraphraseProseText,
  repairBrokenCasing,
  stripDisallowedEditorialBoilerplate,
  stripHtmlTags,
  truncateAtWordBoundary,
} from './liveNewsParser';

export const LIVE_REWRITE_MIGRATION_VERSION = '2026-11-17-no-boilerplate-paraphrase-v5';

/**
 * Strips any legacy "Editorial Verification & Ongoing Monitoring" boilerplate and
 * rewrites existing wire-synced records so headlines & text are paraphrased cleanly
 * without verbatim ("ditto") copying or broken casing artifacts.
 */
export function migrateExistingLiveDispatches(database: DatabaseSync): {
  migratedCount: number;
  archivedStubs: number;
} {
  const flag = database
    .prepare("SELECT value_json FROM site_settings WHERE key = 'live_rewrite_migration_version'")
    .get() as { value_json: string } | undefined;

  if (flag) {
    try {
      if (JSON.parse(flag.value_json) === LIVE_REWRITE_MIGRATION_VERSION) {
        return { migratedCount: 0, archivedStubs: 0 };
      }
    } catch {
      // proceed with migration
    }
  }

  const now = new Date().toISOString();
  const rows = database
    .prepare(
      `SELECT a.id, a.title, a.subheadline, a.summary, a.content_html, a.source_guid, a.source_name, c.slug as category_slug
       FROM articles a
       LEFT JOIN categories c ON a.category_id = c.id
       WHERE a.source_guid IS NOT NULL
          OR a.content_html LIKE '%Editorial Verification%'
          OR a.content_html LIKE '%synthesises verified factual threads%'
          OR a.content_html LIKE '%Ongoing Monitoring%'
          OR a.summary LIKE '%Verified and filed in THE CONTINENTAL%'`
    )
    .all() as Array<{
    id: string;
    title: string;
    subheadline: string;
    summary: string;
    content_html: string;
    source_guid: string | null;
    source_name: string;
    category_slug: string | null;
  }>;

  if (rows.length === 0) {
    database
      .prepare(
        `INSERT INTO site_settings (key, value_json, updated_at) VALUES ('live_rewrite_migration_version', ?, ?)
         ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`
      )
      .run(JSON.stringify(LIVE_REWRITE_MIGRATION_VERSION), now);
    return { migratedCount: 0, archivedStubs: 0 };
  }

  const archiveStmt = database.prepare(
    `UPDATE articles
     SET status = 'archived', is_featured = 0, featured_slot = NULL, is_breaking = 0,
         summary = ?, content_html = ?, updated_at = ?
     WHERE id = ?`
  );
  const updateStmt = database.prepare(
    `UPDATE articles
     SET title = ?, subheadline = ?, summary = ?, content_html = ?, seo_title = ?, seo_description = ?
     WHERE id = ?`
  );
  const updateSavedStmt = database.prepare(
    `UPDATE saved_articles SET title = ?, summary = ? WHERE article_id = ?`
  );

  let migratedCount = 0;
  let archivedStubs = 0;

  database.exec('BEGIN;');
  try {
    for (const row of rows) {
      const cleanedTitleRaw = repairBrokenCasing(
        stripHtmlTags(row.title)
          .replace(/^(?:Dispatch|Global Update|Tech & Science|Sport Update|Markets & Policy)\s*[—–-]\s*/i, '')
      );
      const cleanStubSummary = stripDisallowedEditorialBoilerplate(row.summary);
      const cleanStubHtml = stripDisallowedEditorialBoilerplate(sanitizeEditorialHtml(row.content_html));

      if (
        cleanedTitleRaw.length < 22 ||
        /^(news analysis|morning brief|evening brief|top news|live updates|jensen huang)$/i.test(cleanedTitleRaw) ||
        !isPredominantlyEnglish(cleanedTitleRaw) ||
        (row.source_name && !isPredominantlyEnglish(row.source_name))
      ) {
        archiveStmt.run(cleanStubSummary, cleanStubHtml, now, row.id);
        archivedStubs++;
        continue;
      }

      const categorySlug = row.category_slug || classifyArticleCategory(cleanedTitleRaw, row.summary, '', 'india');
      const nextTitle = paraphraseHeadline(cleanedTitleRaw, categorySlug, { skipGenericWrapper: true });

      const strippedHtml = stripDisallowedEditorialBoilerplate(row.content_html)
        .replace(/<p[^>]*>[\s\S]*?Fresh reporting monitored by THE CONTINENTAL[\s\S]*?<\/p>/gi, '')
        .replace(/<p[^>]*>[\s\S]*?Reported developments around[\s\S]*?<\/p>/gi, '')
        .replace(/<p[^>]*>[^<]*Initial wire dispatches credited to [^<]*<\/p>/gi, '');

      const extractedParagraphs: string[] = [];
      const pRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
      let pMatch: RegExpExecArray | null;
      while ((pMatch = pRegex.exec(strippedHtml)) !== null) {
        const plain = repairBrokenCasing(
          stripHtmlTags(pMatch[1])
            .replace(/^(?:Current reporting indicates that|Available accounts note that)\s+/i, '')
            .replace(/,\s*accounts indicate(?=\s*[—–-]|$)/gi, '')
            .replace(/^[a-zA-Z\s]{2,24}\s+[—–-]\s+(?:Fresh reporting monitored by THE CONTINENTAL[^.]*\.)/i, '')
            .replace(/^According to initial public briefings and reporting attributed to [^,]+,\s*key developments centre on the following details:\s*/i, '')
            .replace(/^Multiple newsroom dispatches tracked via Google News wire monitoring confirm active follow-through across reporting agencies:\s*/i, '')
            .replace(/\s+([.,;:!?])/g, '$1')
            .trim()
        );

        if (!plain || plain.length < 24) continue;
        if (/THE CONTINENTAL synthesises verified factual threads/i.test(plain)) continue;
        if (/Fresh reporting monitored by THE CONTINENTAL/i.test(plain)) continue;
        if (/^reporting across\b/i.test(plain)) continue;

        const datelineMatch = /^([A-Z][A-Z\s]{2,20})\s+[—–-]\s+([\s\S]+)$/.exec(plain);
        if (datelineMatch) {
          const bodyRewritten = paraphraseProseText(datelineMatch[2], { skipGenericWrapper: true });
          if (bodyRewritten) {
            extractedParagraphs.push(`<p>${datelineMatch[1].trim()} — ${bodyRewritten}</p>`);
          }
        } else {
          const rewritten = paraphraseProseText(plain, { skipGenericWrapper: true });
          if (rewritten) {
            extractedParagraphs.push(`<p>${rewritten}</p>`);
          }
        }
      }

      const cleanedSub = repairBrokenCasing(
        stripDisallowedEditorialBoilerplate(row.subheadline)
          .replace(/^(?:Current reporting indicates that|Available accounts note that)\s+/i, '')
          .replace(/,\s*accounts indicate(?=\s*[—–-]|$)/gi, '')
          .replace(/^World News Live Updates:\s*/i, '')
          .replace(/^Developing report compiled by THE CONTINENTAL desk following dispatches from [^:]+:\s*/i, '')
          .replace(/^Cross-agency monitoring by THE CONTINENTAL indicates continuing developments reported across\s*/i, '')
          .replace(/^reporting across [^.]+\.?$/i, '')
          .replace(/\s+([.,;:!?])/g, '$1')
          .trim()
      );

      const nextSubheadline = truncateAtWordBoundary(
        cleanedSub.length > 35
          ? paraphraseProseText(cleanedSub, { skipGenericWrapper: true })
          : `Reporting compiled across ${row.source_name || 'international news outlets'}.`,
        240
      );

      const cleanedSummary = repairBrokenCasing(
        stripDisallowedEditorialBoilerplate(row.summary)
          .replace(/^(?:Current reporting indicates that|Available accounts note that)\s+/i, '')
          .replace(/,\s*accounts indicate(?=\s*[—–-]|$)/gi, '')
          .replace(/^World News Live Updates:\s*/i, '')
          .replace(/^THE CONTINENTAL news desk is tracking\s*"[^"]+",\s*with recent public dispatches noted by\s*/i, '')
          .replace(/^recent public dispatches across [^.]+\.?$/i, '')
          .replace(/\s+([.,;:!?])/g, '$1')
          .trim()
      );

      const nextSummary = truncateAtWordBoundary(
        cleanedSummary.length > 35
          ? paraphraseProseText(cleanedSummary, { skipGenericWrapper: true })
          : `${nextTitle} — developments compiled from accounts across ${row.source_name || 'wire dispatches'}.`,
        360
      );

      if (extractedParagraphs.length === 0) {
        extractedParagraphs.push(`<p>${nextSummary}</p>`);
        extractedParagraphs.push(
          `<p>Accounts compiled from ${row.source_name || 'public news outlets'} point to continuing administrative and public focus on this development.</p>`
        );
      }

      const nextContentHtml = stripDisallowedEditorialBoilerplate(
        sanitizeEditorialHtml(extractedParagraphs.join('\n'))
      );

      updateStmt.run(
        nextTitle,
        nextSubheadline,
        nextSummary,
        nextContentHtml,
        `${nextTitle} | THE CONTINENTAL`,
        nextSummary,
        row.id
      );
      updateSavedStmt.run(nextTitle, nextSummary, row.id);
      migratedCount++;
    }

    database
      .prepare(
        `INSERT INTO site_settings (key, value_json, updated_at) VALUES ('live_rewrite_migration_version', ?, ?)
         ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`
      )
      .run(JSON.stringify(LIVE_REWRITE_MIGRATION_VERSION), now);

    database.exec('COMMIT;');
  } catch (err) {
    database.exec('ROLLBACK;');
    throw err;
  }

  return { migratedCount, archivedStubs };
}
