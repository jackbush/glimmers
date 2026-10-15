// The Tuareg sky culture for Atlas Nights, read by sky-data.mjs.
//
// Source: Henri Duveyrier, Les Touareg du Nord (Exploration du Sahara, Paris 1864), pp. 423–426,
// from the Kel Ajjer and their caravan guides. The names (`duveyrier`: his French transcription),
// their meanings and which stars they are come from him; he identifies most by constellation or
// by Bayer letter (checked against the page scans: archive.org explorationdusa00cossgoog).
// The lines joining a figure's stars are ours: he names the stars, not the strokes between them.
// `native` is the name in Tuareg Tifinagh, converted from Duveyrier's spelling for this sketch
// (the method is in the sketch's SKY-CULTURES.md; a Tamasheq reader should check it). `name` is
// the label's short translation; the stories are in the sketch's SKY-CULTURES.md. A figure with
// one star is a named star; it has nothing to draw but can be hovered. Named stars
// come before the figures they sit in, so pointing right at Polaris names it, not the calf.
//
// Stars are Bayer designations ("α Ori"; "ζ2 Sco" for one component of a double, else the first
// listed) or proper names, resolved to Hipparcos numbers through d3-celestial's star names.
//
// Left out: Venus (Tâtrit-tân-toufat, the morning star) and the Milky Way (Mâhellaou), which
// aren't stars; and the girls Tibaradîn and the pool Tesâhak near Scorpius, which Duveyrier
// declined to place.

export default {
  id: 'tuareg',
  constellations: [
    { native: 'ⴰⴷⵔ ⵏ ⴰⵍⴾⵓ', duveyrier: 'Adâr-n-elâkou', name: 'The foot in the mud', lines: [['β Ori']] },
    { native: 'ⵜⴶⴱⵙⵜ ⵏ ⴰⵎⵏⵔ', duveyrier: 'Tâdjebest-en-Amanâr', name: 'The belt of Amanâr', lines: [['δ Ori', 'ε Ori', 'ζ Ori']] },
    { native: 'ⴰⵎⵏⵔ', duveyrier: 'Amanâr', name: 'He who opens', lines: [['γ Ori', 'λ Ori', 'α Ori', 'γ Ori', 'δ Ori'], ['α Ori', 'ζ Ori', 'κ Ori'], ['δ Ori', 'β Ori']] },
    { native: 'ⴰⵢⴷⵉ', duveyrier: 'Eydi', name: 'The dog', lines: [['α CMa']] },
    { native: 'ⵉⵂⵏⴾⴹ', duveyrier: 'Ihenkâdh', name: 'The gazelles', lines: [['μ Lep', 'α Lep', 'ζ Lep', 'η Lep'], ['α Lep', 'β Lep', 'ε Lep'], ['β Lep', 'γ Lep', 'δ Lep']] },
    { native: 'ⴰⵡⵂⵎ', duveyrier: 'Aouhêm', name: 'The gazelle\'s young', lines: [['β CMa']] },
    { native: 'ⵉⴼⵔⴾⴼⵔⴾⵏ', duveyrier: 'Ifarakfarâken', name: 'The flutter of a fan', lines: [['ε CMa', 'δ CMa', 'η CMa', 'ε CMa']] },
    { native: 'ⵛⵜ ⴰⵂⴹ', duveyrier: 'Chêt-Ahadh', name: 'The daughters of the night', lines: [['Taygeta', 'Maia', 'Alcyone', 'Atlas', 'Merope', 'Electra', 'Taygeta']] },
    { native: 'ⴾⴾⵢⴹ', duveyrier: 'Kôkoyyodh', name: 'Aldebaran', lines: [['α Tau']] },
    { native: 'ⵍⵎⴾⵛⵏ', duveyrier: 'Lemkechen', name: 'Hold!', lines: [['α UMi']] },
    { native: 'ⴰⵡⵔⴰ', duveyrier: 'Aourâ', name: 'The camel calf', lines: [['α UMi', 'δ UMi', 'ε UMi', 'ζ UMi', 'η UMi', 'γ UMi', 'β UMi', 'ζ UMi']] },
    { native: 'ⴰⵍⴶⵎⵜ', duveyrier: 'El-Djema\'at', name: 'The assembly', lines: [['λ UMa', 'μ UMa', 'ψ UMa', 'ν UMa', 'ξ UMa', 'λ UMa']] },
    { native: 'ⵜⵍⵎⵜ', duveyrier: 'Tâlemt', name: 'The she-camel', lines: [['η UMa', 'ζ UMa', 'ε UMa', 'δ UMa', 'α UMa', 'β UMa', 'γ UMa', 'δ UMa']] },
    { native: 'ⴰⵎⵔⵜ', duveyrier: 'Amrôt', name: 'The young man in the palm', lines: [['α Sco']] },
    { native: 'ⵜⵣⵢⵜ', duveyrier: 'Tâzzeït', name: 'The palm tree', lines: [['β Sco', 'δ Sco', 'π Sco'], ['δ Sco', 'σ Sco', 'α Sco', 'τ Sco', 'ε Sco', 'μ1 Sco', 'ζ2 Sco', 'η Sco', 'θ Sco', 'ι Sco', 'κ Sco', 'λ Sco']] },
    { native: 'ⵜⵏⴼⵍⵜ', duveyrier: 'Tenâfelit', name: 'Wealth', lines: [['δ Vel']] },
    { native: 'ⵜⵣⵔⵜ', duveyrier: 'Tôzzert', name: 'Poverty', lines: [['ο Vel']] },
    { native: 'ⵡⴷⵜ', duveyrier: 'Ouâdet', name: 'Canopus', lines: [['α Car']] },
  ],
};
