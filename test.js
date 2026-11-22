'use strict';
// Expected bytes are the Aurelux app captures from lednetwf_ble tests/test_iotbt_e0.py.
const test = require('node:test');
const assert = require('node:assert');
const { wrap, power, color, scene, SCENES } = require('./packets');

const hex = (b) => b.toString('hex');

test('power', () => {
  assert.strictEqual(hex(power(true)), 'e0010023' + '00'.repeat(10));
  assert.strictEqual(hex(power(false)), 'e0010024' + '00'.repeat(10));
});

test('solid colours match capture', () => {
  assert.strictEqual(hex(color(0, 100, 100)), 'e00100c100646400000000140000'); // red
  assert.strictEqual(hex(color(120, 100, 100)), 'e00100c13c646400000000140000'); // green
  assert.strictEqual(hex(color(240, 100, 100)), 'e00100c178646400000000140000'); // blue
  assert.strictEqual(hex(color(0, 0, 100)), 'e00100c100006400000000140000'); // white
  assert.strictEqual(hex(color(0, 0, 49)), 'e00100c100003100000000140000'); // brightness = value byte
  assert.strictEqual(color(0, 0, 0)[6], 1); // never 0: brightness 0 is handled as off
});

test('header matches capture', () => {
  const pkt = wrap(power(true), 7);
  assert.strictEqual(hex(pkt.subarray(0, 8)), '0007800000' + '0e0f0a');
});

test('scenes are well formed', () => {
  assert.strictEqual(Object.keys(SCENES).length, 42);
  for (const name of Object.keys(SCENES)) {
    const p = scene(name);
    assert.strictEqual(hex(p.subarray(0, 2)), 'e121', name);
    assert.strictEqual(p.length, 16 + 5 * p[15], name); // colour count at byte 15
  }
  assert.strictEqual(hex(scene('Meteor Shower')), 'e12100640b00056450007864640000011e64640000');
});
