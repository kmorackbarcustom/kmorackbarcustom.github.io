import assert from 'node:assert/strict';
import test from 'node:test';

import {
  multipleRowsOrThrow,
  singleRowOrNull,
} from '../apps/booking-consumer/src/lib/load-result.ts';

test('single-row read throws on query error and never degrades to null', () => {
  assert.throws(
    () => singleRowOrNull({ data: null, error: { message: 'network unreachable' } }, 'shop'),
    /network unreachable/,
  );
  assert.throws(
    () => singleRowOrNull({ data: null, error: {} }, 'shop'),
    /Failed to fetch shop/,
  );
});

test('single-row read returns null only for a genuine no-row result', () => {
  assert.equal(singleRowOrNull({ data: null, error: null }, 'shop'), null);
});

test('single-row read returns the row when the query succeeded', () => {
  const row = { id: 'shop-1' };
  assert.equal(singleRowOrNull({ data: row, error: null }, 'shop'), row);
});

test('multi-row read throws on query error and never degrades to an empty array', () => {
  assert.throws(
    () => multipleRowsOrThrow<{ id: string }>({ data: null, error: { message: 'boom' } }, 'services'),
    /boom/,
  );
  assert.throws(
    () => multipleRowsOrThrow<{ id: string }>({ data: [], error: {} }, 'services'),
    /Failed to fetch services/,
  );
});

test('multi-row read returns an empty array only for a genuine empty result', () => {
  assert.deepEqual(multipleRowsOrThrow<{ id: string }>({ data: null, error: null }, 'services'), []);
  assert.deepEqual(multipleRowsOrThrow<{ id: string }>({ data: [], error: null }, 'services'), []);
});

test('multi-row read returns the rows when the query succeeded', () => {
  const rows = [{ id: 'staff-1' }];
  assert.equal(multipleRowsOrThrow({ data: rows, error: null }, 'staff'), rows);
});

test('the module is framework, network and database free', async () => {
  const source = await import('node:fs/promises').then((fs) =>
    fs.readFile(new URL('../apps/booking-consumer/src/lib/load-result.ts', import.meta.url), 'utf8'),
  );
  assert.doesNotMatch(source, /\bfrom\s+['"]/);
  assert.doesNotMatch(source, /\bimport\s*\(/);
});
