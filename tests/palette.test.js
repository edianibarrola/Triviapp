import test from 'node:test';
import assert from 'node:assert/strict';
import { extractColors, PRESETS, safePalette, contrast } from '../src/palette.js';

test('transparent RGB values do not pollute extracted colors', () => {
  const pixels = new Uint8ClampedArray([0, 255, 0, 0, 255, 100, 0, 255, 255, 100, 0, 255, 255, 248, 224, 255]);
  const result = extractColors(pixels);
  assert.equal(result.accent, '#ff6400');
  assert.ok(!result.colors.includes('#00ff00'));
});
test('orange logo ink wins over larger neutral backdrop', () => {
  const pixels = [];
  for (let i = 0; i < 300; i++) pixels.push(245, 240, 220, 255);
  for (let i = 0; i < 50; i++) pixels.push(255, 100, 0, 255);
  assert.equal(extractColors(new Uint8ClampedArray(pixels)).accent, '#ff6400');
});
test('transparent images fail clearly; grayscale marks give a readable fallback', () => {
  assert.throws(() => extractColors(new Uint8ClampedArray([255, 20, 20, 0])), /transparent/);
  const p = extractColors(new Uint8ClampedArray([10, 10, 10, 255])).palette;
  assert.ok(contrast(p.accent, p.background) >= 4.5);
});
test('preset and arbitrary brand colors keep text and button contrast', () => {
  for (const accent of ['#000000', '#ff0000', '#ffffff', '#121212', '#200045', '#444444', ...PRESETS.map(p => p.accent)]) {
    const p = safePalette({ name: 'test', background: '#141719', text: '#141719', accent });
    assert.ok(contrast(p.text, p.background) >= 4.5);
    assert.ok(contrast(p.accent, p.background) >= 4.5);
    assert.ok(contrast(p.buttonText, p.accent) >= 4.5);
  }
  assert.throws(() => safePalette({ accent: 'red', background: '#000000', text: '#ffffff' }), /valid colors/);
});
