import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clampScrollProgress,
  countEditorialWords,
  getReaderProseClass,
  isValidFontScale,
  persistFontScale,
  readStoredFontScale,
} from './readerPreferences';

test('isValidFontScale validates supported font scale tokens', () => {
  assert.equal(isValidFontScale('standard'), true);
  assert.equal(isValidFontScale('comfortable'), true);
  assert.equal(isValidFontScale('large'), true);
  assert.equal(isValidFontScale('huge'), false);
  assert.equal(isValidFontScale(null), false);
});

test('readStoredFontScale and persistFontScale round-trip valid scales safely', () => {
  const mem = new Map<string, string>();
  const mockStorage = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => {
      mem.set(k, v);
    },
  };

  assert.equal(readStoredFontScale(mockStorage), 'standard');
  persistFontScale('large', mockStorage);
  assert.equal(readStoredFontScale(mockStorage), 'large');

  mem.set('tc_reader_font_scale', 'invalid-value');
  assert.equal(readStoredFontScale(mockStorage), 'standard');
});

test('getReaderProseClass returns expected CSS class modifier', () => {
  assert.equal(getReaderProseClass('standard'), '');
  assert.equal(getReaderProseClass('comfortable'), 'prose-comfortable');
  assert.equal(getReaderProseClass('large'), 'prose-large');
});

test('clampScrollProgress computes bounded 0..100 percentages', () => {
  assert.equal(clampScrollProgress(0, 2000, 800), 0);
  assert.equal(clampScrollProgress(600, 2000, 800), 50);
  assert.equal(clampScrollProgress(1500, 2000, 800), 100);
  assert.equal(clampScrollProgress(-50, 2000, 800), 0);
  assert.equal(clampScrollProgress(100, 800, 800), 0);
});

test('countEditorialWords strips HTML tags and entities accurately', () => {
  assert.equal(countEditorialWords(''), 0);
  assert.equal(countEditorialWords('<p>Hello&nbsp;world from <strong>New Delhi</strong>.</p>'), 5);
});
