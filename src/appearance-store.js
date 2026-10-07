import { PRESETS, safePalette } from './palette.js';
export const APPEARANCE_KEY = 'triviapp.appearance.v1';
export const defaultAppearance = () => ({ venue: 'Three Odd Guys Brewing', logo: null, palette: safePalette(PRESETS[0]), showTimer: false, timerMode: 'elapsed', countdown: 90 });
export function loadAppearance() {
  const raw = localStorage.getItem(APPEARANCE_KEY);
  if (!raw) return defaultAppearance();
  const a = JSON.parse(raw);
  if (a.logo && !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(a.logo)) throw new Error('Saved logo is invalid.');
  return { ...defaultAppearance(), ...a, palette: safePalette(a.palette) };
}
export function saveAppearance(a) {
  if (!a.venue.trim() || a.venue.length > 60) throw new Error('Give the venue a name (up to 60 characters).');
  if (!Number.isInteger(a.countdown) || a.countdown < 10 || a.countdown > 600) throw new Error('Countdown must be 10–600 seconds.');
  const safe = { ...a, venue: a.venue.trim(), palette: safePalette(a.palette) };
  localStorage.setItem(APPEARANCE_KEY, JSON.stringify(safe));
  return safe;
}
