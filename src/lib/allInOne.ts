import { getIstDateParts, getMonthName } from './dateIst';

export const MAX_DOCX_UPLOAD_BYTES = 50 * 1024 * 1024; // 50 MB

export const ALLOWED_DOCX_MIME_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/zip',
  'application/x-zip-compressed',
  'application/octet-stream',
  '',
]);

export interface CalendarDayCell {
  isoDate: string;
  day: number;
  inCurrentMonth: boolean;
  count: number;
  isToday: boolean;
}

export function validateDocxUploadMeta(file: {
  name: string;
  size: number;
  type?: string;
}): { ok: true } | { ok: false; error: string } {
  const name = (file.name || '').trim();
  if (!name || !name.toLowerCase().endsWith('.docx')) {
    return {
      ok: false,
      error: 'Only Microsoft Word (.docx) files are accepted for manuscript upload.',
    };
  }
  if (!Number.isFinite(file.size) || file.size <= 0) {
    return {
      ok: false,
      error: 'The selected .docx file is empty.',
    };
  }
  if (file.size > MAX_DOCX_UPLOAD_BYTES) {
    return {
      ok: false,
      error: 'The .docx manuscript exceeds the maximum allowed size of 50 MB.',
    };
  }
  const mime = (file.type || '').trim().toLowerCase();
  if (mime && !ALLOWED_DOCX_MIME_TYPES.has(mime)) {
    return {
      ok: false,
      error: 'Unsupported file format. Please upload a valid .docx document (max 50 MB).',
    };
  }
  return { ok: true };
}

export function formatBytesHuman(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(mb < 10 ? 2 : 1)} MB`;
}

export function toIstIsoDateKey(isoString: string | null | undefined): string {
  if (!isoString) return '';
  const parsed = new Date(isoString);
  if (Number.isNaN(parsed.getTime())) return '';
  return getIstDateParts(parsed).isoDate;
}

export function shiftYearMonth(
  year: number,
  month: number,
  deltaMonths: number
): { year: number; month: number } {
  const zeroIndexed = year * 12 + (month - 1) + deltaMonths;
  const nextYear = Math.floor(zeroIndexed / 12);
  const nextMonth = ((zeroIndexed % 12) + 12) % 12 + 1;
  return { year: nextYear, month: nextMonth };
}

export function formatYearMonthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

export function formatYearMonthHeading(year: number, month: number): string {
  return `${getMonthName(month)} ${year}`;
}

export function buildCalendarMonthGrid(
  year: number,
  month: number,
  countsByDate: Record<string, number>,
  todayIso: string = getIstDateParts().isoDate
): CalendarDayCell[] {
  const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay(); // 0=Sun..6=Sat
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const prevMonthDays = new Date(Date.UTC(year, month - 1, 0)).getUTCDate();
  const prevYM = shiftYearMonth(year, month, -1);
  const nextYM = shiftYearMonth(year, month, 1);

  const cells: CalendarDayCell[] = [];

  for (let i = firstWeekday - 1; i >= 0; i--) {
    const day = prevMonthDays - i;
    const isoDate = `${formatYearMonthKey(prevYM.year, prevYM.month)}-${String(day).padStart(2, '0')}`;
    cells.push({
      isoDate,
      day,
      inCurrentMonth: false,
      count: countsByDate[isoDate] || 0,
      isToday: isoDate === todayIso,
    });
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const isoDate = `${formatYearMonthKey(year, month)}-${String(day).padStart(2, '0')}`;
    cells.push({
      isoDate,
      day,
      inCurrentMonth: true,
      count: countsByDate[isoDate] || 0,
      isToday: isoDate === todayIso,
    });
  }

  const totalCells = cells.length <= 35 ? 35 : 42;
  let nextDay = 1;
  while (cells.length < totalCells) {
    const isoDate = `${formatYearMonthKey(nextYM.year, nextYM.month)}-${String(nextDay).padStart(2, '0')}`;
    cells.push({
      isoDate,
      day: nextDay,
      inCurrentMonth: false,
      count: countsByDate[isoDate] || 0,
      isToday: isoDate === todayIso,
    });
    nextDay++;
  }

  return cells;
}

export function decodeHtmlEntitiesForDocument(text: string): string {
  return text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&mdash;/gi, '—')
    .replace(/&ndash;/gi, '–')
    .replace(/&rsquo;/gi, '’')
    .replace(/&lsquo;/gi, '‘')
    .replace(/&rdquo;/gi, '”')
    .replace(/&ldquo;/gi, '“')
    .replace(/&hellip;/gi, '...')
    .replace(/&#(\d+);/g, (_m, dec) => {
      const code = Number.parseInt(dec, 10);
      return Number.isFinite(code) ? String.fromCharCode(code) : '';
    });
}

export function htmlToPlainParagraphs(html: string): string[] {
  if (!html) return [];
  const withBreaks = html
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/(p|h1|h2|h3|h4|h5|h6|blockquote|li|div|tr)>/gi, '\n\n')
    .replace(/<li\b[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '');

  const decoded = decodeHtmlEntitiesForDocument(withBreaks);
  return decoded
    .split(/\n{2,}/)
    .map((para) =>
      para
        .split('\n')
        .map((line) => line.replace(/[ \t]+/g, ' ').trim())
        .filter(Boolean)
        .join('\n')
    )
    .filter(Boolean);
}

export function buildExportFilename(
  ext: 'docx' | 'pdf',
  scope: 'all' | 'month' | 'day',
  value?: string,
  categorySlug?: string
): string {
  const catPart =
    categorySlug && categorySlug !== 'all'
      ? `-${categorySlug.toLowerCase().replace(/[^a-z0-9-]/g, '')}`
      : '';
  const safeVal = (value || '').replace(/[^0-9-]/g, '');
  if (scope === 'day' && /^\d{4}-\d{2}-\d{2}$/.test(safeVal)) {
    return `the-continental-news-${safeVal}${catPart}.${ext}`;
  }
  if (scope === 'month' && /^\d{4}-\d{2}$/.test(safeVal)) {
    return `the-continental-news-${safeVal}${catPart}.${ext}`;
  }
  return `the-continental-all-news${catPart}.${ext}`;
}
