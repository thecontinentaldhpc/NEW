export type ReaderFontScale = 'standard' | 'comfortable' | 'large';

export const READER_FONT_SCALE_KEY = 'tc_reader_font_scale';

export function isValidFontScale(value: unknown): value is ReaderFontScale {
  return value === 'standard' || value === 'comfortable' || value === 'large';
}

export function readStoredFontScale(
  storage?: Pick<Storage, 'getItem'> | null
): ReaderFontScale {
  try {
    const store = storage ?? (typeof window !== 'undefined' ? window.localStorage : null);
    const val = store?.getItem(READER_FONT_SCALE_KEY);
    return isValidFontScale(val) ? val : 'standard';
  } catch {
    return 'standard';
  }
}

export function persistFontScale(
  scale: ReaderFontScale,
  storage?: Pick<Storage, 'setItem'> | null
): void {
  try {
    const store = storage ?? (typeof window !== 'undefined' ? window.localStorage : null);
    store?.setItem(READER_FONT_SCALE_KEY, scale);
  } catch {
    // ignore storage quota / privacy mode errors
  }
}

export function getReaderProseClass(scale: ReaderFontScale): string {
  if (scale === 'comfortable') return 'prose-comfortable';
  if (scale === 'large') return 'prose-large';
  return '';
}

export function clampScrollProgress(
  scrollY: number,
  scrollHeight: number,
  viewportHeight: number
): number {
  const scrollable = scrollHeight - viewportHeight;
  if (!Number.isFinite(scrollable) || scrollable <= 0) {
    return 0;
  }
  const ratio = (Math.max(0, scrollY) / scrollable) * 100;
  return Math.min(100, Math.max(0, Math.round(ratio * 10) / 10));
}

export function countEditorialWords(htmlOrText: string): number {
  if (!htmlOrText) return 0;
  const plain = htmlOrText
    .replace(/<\/?(p|div|br|li|ul|ol|h[1-6]|blockquote|tr|td|th|section|article|figcaption|figure)\b[^>]*>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!plain) return 0;
  return plain.split(' ').filter(Boolean).length;
}
