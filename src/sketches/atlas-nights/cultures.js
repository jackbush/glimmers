// Atlas Nights — the sky cultures the Constellations dropdown offers, in menu order. Each names a
// culture in sky.js's CULTURES, and for the western one how many of its 88 to draw (by rank).
//
// The Arabic sets are the traditions with a history in Morocco: the lunar mansions (manāzil)
// that the Maghreb's farming calendar ran on; al-Ṣūfī's 10th-century Book of the Fixed Stars,
// the star map of Islamic astronomy (and of the astrolabes made in Fez and Marrakech); and the
// Bedouin asterisms the Arab tribes carried west. They come from Stellarium's sky cultures,
// by Khalid al-Ajaji (CC BY-ND 4.0), unaltered.

export const SKY_CULTURES = [
  { label: 'Western: main', culture: 'western', rank: 1 },
  { label: 'Western: more', culture: 'western', rank: 2 },
  { label: 'Western: all 88', culture: 'western', rank: 3 },
  { label: 'Arabic: lunar mansions', culture: 'arabic_lunar_stations', rank: 1 },
  { label: 'Arabic: al-Ṣūfī', culture: 'arabic_al-sufi', rank: 1 },
  { label: 'Arabic: Bedouin', culture: 'arabic_ancient', rank: 1 },
];
