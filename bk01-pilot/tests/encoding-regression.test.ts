import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const target = 'apps/booking-consumer/src/lib/booking-service.ts';

test('booking service stays UTF-8 without BOM and without known mojibake markers', () => {
  const bytes = readFileSync(target);
  assert.notDeepEqual(Array.from(bytes.subarray(0, 3)), [0xef, 0xbb, 0xbf]);

  const text = bytes.toString('utf8');
  assert.doesNotMatch(text, /à¸|à¹|ï»¿/);
  assert.match(text, /ร้านนี้ไม่รับจองคิวออนไลน์ในขณะนี้/);
  assert.match(text, /รองรับเฉพาะไฟล์ JPG, PNG หรือ WebP/);
  assert.match(text, /ไฟล์สลิปต้องมีขนาดไม่เกิน 5 MB/);
});