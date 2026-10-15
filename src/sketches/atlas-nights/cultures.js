// Atlas Nights — the sky cultures the Constellations dropdown offers, in menu order, each naming
// a culture in sky.js's CULTURES and, where the culture has its own hand, the font its native
// names are set in. Where each comes from, and how it was put together, is in SKY-CULTURES.md.

// Font URLs are written out in full so the bundler sees and ships the files.
const font = (family, url) => ({ family, url: url.href });

export const SKY_CULTURES = [
  { label: 'Bedouin', culture: 'arabic_ancient' },
  // Tuareg Tifinagh in its Ghat letterforms, near where Duveyrier's informants lived (Noto, OFL).
  { label: 'Tuareg', culture: 'tuareg', font: font('Noto Sans Tifinagh Ghat', new URL('./fonts/NotoSansTifinaghGhat-Regular.ttf', import.meta.url)) },
  // Maghribi script: Youssef Jabri's Rabat (Maghribi Mabsout), "may be used freely"; shipped as
  // downloaded, unmodified, as its licence asks.
  { label: 'Maghrebi', culture: 'arabic_lunar_stations', font: font('Rabat', new URL('./fonts/Rabat.otf', import.meta.url)) },
  { label: 'Arabic', culture: 'arabic_al-sufi' },
  { label: 'Greek', culture: 'greek' },
  { label: 'Western', culture: 'western' },
];
