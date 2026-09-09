import assert from 'node:assert/strict';
import test from 'node:test';
import { isValidTimeInput, normalizeTimeInput } from '../apps/booking-admin/src/lib/time-input.ts';

test('time input normalizes documented mobile-friendly formats', () => {
  const cases: Array<[string, string]> = [
    ['8', '08:00'],
    ['08', '08:00'],
    ['800', '08:00'],
    ['0830', '08:30'],
    ['8:30', '08:30'],
    ['08:30', '08:30'],
    [' 18:00 ', '18:00'],
  ];

  for (const [input, expected] of cases) {
    assert.equal(normalizeTimeInput(input), expected, input);
    assert.equal(isValidTimeInput(input), true, input);
  }
});

test('time input rejects malformed or impossible values instead of guessing', () => {
  const invalid = ['', '25:00', '12:60', '1260', 'abc', '12x30', '8.30', '12345', '-830'];
  for (const input of invalid) {
    assert.equal(isValidTimeInput(input), false, input);
  }
});