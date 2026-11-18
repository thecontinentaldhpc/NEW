import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCalendarMonthGrid,
  buildExportFilename,
  formatBytesHuman,
  formatYearMonthHeading,
  formatYearMonthKey,
  htmlToPlainParagraphs,
  MAX_DOCX_UPLOAD_BYTES,
  shiftYearMonth,
  toIstIsoDateKey,
  validateDocxUploadMeta,
} from './allInOne';

test('validateDocxUploadMeta enforces .docx extension, non-empty size, and 50 MB cap', () => {
  assert.equal(MAX_DOCX_UPLOAD_BYTES, 50 * 1024 * 1024);

  assert.deepEqual(
    validateDocxUploadMeta({
      name: 'manuscript.docx',
      size: 1024,
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    }),
    { ok: true }
  );

  assert.deepEqual(
    validateDocxUploadMeta({
      name: 'max-size.DOCX',
      size: MAX_DOCX_UPLOAD_BYTES,
      type: '',
    }),
    { ok: true }
  );

  const tooBig = validateDocxUploadMeta({
    name: 'oversized.docx',
    size: MAX_DOCX_UPLOAD_BYTES + 1,
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
  assert.equal(tooBig.ok, false);
  if (!tooBig.ok) {
    assert.match(tooBig.error, /50 MB/);
  }

  const wrongExt = validateDocxUploadMeta({
    name: 'article.pdf',
    size: 2048,
    type: 'application/pdf',
  });
  assert.equal(wrongExt.ok, false);

  const emptyFile = validateDocxUploadMeta({
    name: 'empty.docx',
    size: 0,
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
  assert.equal(emptyFile.ok, false);
});

test('formatBytesHuman renders readable KB and MB sizes', () => {
  assert.equal(formatBytesHuman(0), '0 B');
  assert.equal(formatBytesHuman(512), '512 B');
  assert.equal(formatBytesHuman(5 * 1024), '5.0 KB');
  assert.equal(formatBytesHuman(50 * 1024 * 1024), '50.0 MB');
});

test('toIstIsoDateKey converts UTC timestamps into IST YYYY-MM-DD keys', () => {
  // 2026-11-16T20:00:00Z is 2026-11-17 01:30 IST
  assert.equal(toIstIsoDateKey('2026-11-16T20:00:00.000Z'), '2026-11-17');
  assert.equal(toIstIsoDateKey('2026-11-16T03:00:00.000Z'), '2026-11-16');
  assert.equal(toIstIsoDateKey('invalid-date'), '');
  assert.equal(toIstIsoDateKey(null), '');
});

test('shiftYearMonth and calendar grid cover full weeks accurately', () => {
  assert.deepEqual(shiftYearMonth(2026, 1, -1), { year: 2025, month: 12 });
  assert.deepEqual(shiftYearMonth(2026, 12, 1), { year: 2027, month: 1 });
  assert.equal(formatYearMonthKey(2026, 3), '2026-03');
  assert.equal(formatYearMonthHeading(2026, 11), 'November 2026');

  const grid = buildCalendarMonthGrid(
    2026,
    11,
    { '2026-11-16': 4, '2026-11-15': 2 },
    '2026-11-16'
  );
  assert.ok(grid.length === 35 || grid.length === 42);
  const nov16 = grid.find((c) => c.isoDate === '2026-11-16');
  assert.ok(nov16);
  assert.equal(nov16.inCurrentMonth, true);
  assert.equal(nov16.count, 4);
  assert.equal(nov16.isToday, true);
});

test('htmlToPlainParagraphs strips tags and decodes editorial entities', () => {
  const html = '<p>NEW DELHI &mdash; Leaders met today.</p><blockquote>&ldquo;Facts endure.&rdquo;</blockquote>';
  assert.deepEqual(htmlToPlainParagraphs(html), [
    'NEW DELHI — Leaders met today.',
    '“Facts endure.”',
  ]);
});

test('buildExportFilename creates clean deterministic filenames', () => {
  assert.equal(buildExportFilename('docx', 'all'), 'the-continental-all-news.docx');
  assert.equal(buildExportFilename('pdf', 'day', '2026-11-16', 'world'), 'the-continental-news-2026-11-16-world.pdf');
  assert.equal(buildExportFilename('docx', 'month', '2026-11'), 'the-continental-news-2026-11.docx');
});
