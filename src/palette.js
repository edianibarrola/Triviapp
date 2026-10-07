export const PRESETS = [
  { name: 'Orange & Cream', accent: '#ff7c2b', background: '#141719', text: '#fff4de' },
  { name: 'Lime & Charcoal', accent: '#d4fa74', background: '#11141b', text: '#faf5e9' },
  { name: 'Blue & Ice', accent: '#62c9ff', background: '#101925', text: '#edf7ff' },
];
export const fromHex = hex => hex.slice(1).match(/../g).map(x => parseInt(x, 16));
export const toHex = rgb => '#' + rgb.map(x => Math.round(x).toString(16).padStart(2, '0')).join('');
export function luminance(hex) {
  const c = fromHex(hex).map(n => { n /= 255; return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4; });
  return c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722;
}
export function contrast(a, b) {
  const x = luminance(a), y = luminance(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
export function readableAccent(accent, background) {
  let rgb = fromHex(accent);
  for (let i = 0; i < 100 && contrast(toHex(rgb), background) < 4.5; i++) rgb = rgb.map(c => c + (255 - c) * 0.06);
  return toHex(rgb);
}
export function safePalette(palette) {
  const valid = value => /^#[\da-f]{6}$/i.test(value);
  if (![palette.accent, palette.background, palette.text].every(valid)) throw new Error('Choose valid colors.');
  // Keep the working surface dark and the main text readable for every palette.
  const background = luminance(palette.background) <= 0.06 ? palette.background : '#141719';
  const text = contrast(palette.text, background) >= 4.5 ? palette.text : '#fff4de';
  const accent = readableAccent(palette.accent, background);
  const buttonText = contrast('#11141b', accent) >= contrast('#ffffff', accent) ? '#11141b' : '#ffffff';
  return { ...palette, background, text, accent, buttonText };
}

// Alpha-weighted quantized histogram. Prefer brand chroma over white backdrops.
export function extractColors(pixels) {
  const bins = new Map();
  for (let i = 0; i < pixels.length; i += 4) {
    const [r, g, b, a] = pixels.slice(i, i + 4);
    if (a < 128) continue;
    const key = [r, g, b].map(c => Math.floor(c / 24)).join(',');
    const bin = bins.get(key) || { weight: 0, rgb: [0, 0, 0] };
    const weight = a / 255;
    bin.weight += weight; [r, g, b].forEach((c, j) => bin.rgb[j] += c * weight); bins.set(key, bin);
  }
  const colors = [...bins.values()].map(b => ({ rgb: b.rgb.map(c => c / b.weight), weight: b.weight }))
    .sort((a, b) => b.weight - a.weight);
  if (!colors.length) throw new Error('This image is fully transparent. Choose a visible logo.');
  const total = colors.reduce((n, c) => n + c.weight, 0);
  const chromatic = colors.filter(c => {
    const max = Math.max(...c.rgb), min = Math.min(...c.rgb);
    return max > 65 && max - min > 45 && (max - min) / max > 0.25 && c.weight / total > 0.005;
  });
  const accent = toHex((chromatic[0] || colors[0]).rgb);
  const neutral = colors.find(c => Math.min(...c.rgb) > 180);
  return { accent, colors: [accent, ...colors.map(c => toHex(c.rgb)).filter(c => c !== accent)].slice(0, 5),
    palette: safePalette({ name: 'From your logo', accent, background: '#141719', text: neutral ? toHex(neutral.rgb) : '#fff4de' }) };
}

export async function processLogo(file) {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw new Error('Use a PNG, JPEG, or WebP image.');
  if (file.size > 5 * 1024 * 1024) throw new Error('Choose an image smaller than 5 MB.');
  const url = URL.createObjectURL(file);
  try {
    const img = new Image(); img.src = url; await img.decode();
    if (!img.naturalWidth || img.naturalWidth * img.naturalHeight > 25_000_000) throw new Error('Choose an image smaller than 25 megapixels.');
    const canvas = document.createElement('canvas');
    const scale = Math.min(1, 512 / Math.max(img.naturalWidth, img.naturalHeight));
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const logo = canvas.toDataURL('image/png');
    const sample = document.createElement('canvas'); sample.width = 96; sample.height = 96;
    const sampleCtx = sample.getContext('2d', { willReadFrequently: true });
    sampleCtx.drawImage(canvas, 0, 0, 96, 96);
    let suggestion;
    try { suggestion = extractColors(sampleCtx.getImageData(0, 0, 96, 96).data); }
    catch (e) { throw new Error(e.message); }
    return { logo, suggestion };
  } catch (e) {
    if (e.name === 'EncodingError') throw new Error('This image could not be opened. Try exporting it as PNG.');
    throw e;
  } finally { URL.revokeObjectURL(url); }
}
