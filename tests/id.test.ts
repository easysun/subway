import test from 'node:test';
import assert from 'node:assert/strict';
import { newRecordId } from '../lib/id.ts';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

test('native UUID generation is preferred when it is available', () => {
  const expected = '00112233-4455-4677-8899-aabbccddeeff';
  let nativeCalls = 0;
  const source: Pick<Crypto, 'getRandomValues' | 'randomUUID'> = {
    randomUUID() {
      assert.equal(this, source);
      nativeCalls += 1;
      return expected;
    },
    getRandomValues() {
      throw new Error('Fallback must not run when native UUID generation is available.');
    },
  };

  assert.equal(newRecordId(source), expected);
  assert.equal(nativeCalls, 1);
});

test('HTTP-compatible fallback uses the supplied entropy and creates a UUID v4', () => {
  let entropyCalls = 0;
  const source: Pick<Crypto, 'getRandomValues'> = {
    getRandomValues<T extends ArrayBufferView | null>(array: T): T {
      assert.ok(array instanceof Uint8Array);
      assert.equal(array.byteLength, 16);
      entropyCalls += 1;
      array.set([0x00, 0x11, 0x22, 0x33, 0x44, 0x55, 0xee, 0x77, 0xff, 0x99, 0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff]);
      return array;
    },
  };

  const id = newRecordId(source);
  assert.equal(id, '00112233-4455-4e77-bf99-aabbccddeeff');
  assert.match(id, UUID_V4);
  assert.equal(entropyCalls, 1);
});

test('fallback requests fresh cryptographic entropy for every record', () => {
  let entropyCalls = 0;
  const source: Pick<Crypto, 'getRandomValues'> = {
    getRandomValues<T extends ArrayBufferView | null>(array: T): T {
      assert.ok(array !== null);
      entropyCalls += 1;
      globalThis.crypto.getRandomValues(array);
      return array;
    },
  };

  const ids = Array.from({ length: 256 }, () => newRecordId(source));
  ids.forEach((id) => assert.match(id, UUID_V4));
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(entropyCalls, ids.length);
});

test('the default crypto source produces unique valid record IDs', () => {
  const ids = Array.from({ length: 256 }, () => newRecordId());
  ids.forEach((id) => assert.match(id, UUID_V4));
  assert.equal(new Set(ids).size, ids.length);
});

test('entropy failures are propagated instead of producing insecure record IDs', () => {
  const source: Pick<Crypto, 'getRandomValues'> = {
    getRandomValues() {
      throw new Error('Secure entropy unavailable');
    },
  };

  assert.throws(() => newRecordId(source), /Secure entropy unavailable/);
});
