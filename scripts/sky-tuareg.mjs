// The Tuareg sky culture for Atlas Nights, read by sky-data.mjs.
//
// Source: Henri Duveyrier, Les Touareg du Nord (Exploration du Sahara, Paris 1864), pp. 423–426,
// from the Kel Ajjer and their caravan guides. The names (in Duveyrier's French transcription),
// their meanings and which stars they are come from him; he identifies most by constellation or
// by Bayer letter (checked against the page scans: archive.org explorationdusa00cossgoog).
// The lines joining a figure's stars are ours: he names the stars, not the strokes between them.
// `name` is the label's short translation; the stories are in the sketch's NOTES.md. A figure with
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
    { native: 'Adâr-n-elâkou', name: 'the foot in the mud', lines: [['β Ori']] },
    { native: 'Tâdjebest-en-Amanâr', name: 'the belt of Amanâr', lines: [['δ Ori', 'ε Ori', 'ζ Ori']] },
    { native: 'Amanâr', name: 'he who opens', lines: [['γ Ori', 'λ Ori', 'α Ori', 'γ Ori', 'δ Ori'], ['α Ori', 'ζ Ori', 'κ Ori'], ['δ Ori', 'β Ori']] },
    { native: 'Eydi', name: 'the dog', lines: [['α CMa']] },
    { native: 'Ihenkâdh', name: 'the gazelles', lines: [['μ Lep', 'α Lep', 'ζ Lep', 'η Lep'], ['α Lep', 'β Lep', 'ε Lep'], ['β Lep', 'γ Lep', 'δ Lep']] },
    { native: 'Aouhêm', name: 'the gazelle\'s young', lines: [['β CMa']] },
    { native: 'Ifarakfarâken', name: 'the flutter of a fan', lines: [['ε CMa', 'δ CMa', 'η CMa', 'ε CMa']] },
    { native: 'Chêt-Ahadh', name: 'the daughters of the night', lines: [['Taygeta', 'Maia', 'Alcyone', 'Atlas', 'Merope', 'Electra', 'Taygeta']] },
    { native: 'Kôkoyyodh', name: 'Aldebaran', lines: [['α Tau']] },
    { native: 'Lemkechen', name: 'hold!', lines: [['α UMi']] },
    { native: 'Aourâ', name: 'the camel calf', lines: [['α UMi', 'δ UMi', 'ε UMi', 'ζ UMi', 'η UMi', 'γ UMi', 'β UMi', 'ζ UMi']] },
    { native: 'El-Djema\'at', name: 'the assembly', lines: [['λ UMa', 'μ UMa', 'ψ UMa', 'ν UMa', 'ξ UMa', 'λ UMa']] },
    { native: 'Tâlemt', name: 'the she-camel', lines: [['η UMa', 'ζ UMa', 'ε UMa', 'δ UMa', 'α UMa', 'β UMa', 'γ UMa', 'δ UMa']] },
    { native: 'Amrôt', name: 'the young man in the palm', lines: [['α Sco']] },
    { native: 'Tâzzeït', name: 'the palm tree', lines: [['β Sco', 'δ Sco', 'π Sco'], ['δ Sco', 'σ Sco', 'α Sco', 'τ Sco', 'ε Sco', 'μ1 Sco', 'ζ2 Sco', 'η Sco', 'θ Sco', 'ι Sco', 'κ Sco', 'λ Sco']] },
    { native: 'Tenâfelit', name: 'wealth', lines: [['δ Vel']] },
    { native: 'Tôzzert', name: 'poverty', lines: [['ο Vel']] },
    { native: 'Ouâdet', name: 'Canopus', lines: [['α Car']] },
  ],
};
