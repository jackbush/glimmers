/** @type {import('../../kit/types').Manifest} */
export default {
  name: 'Homepage',
  year: 2026,
  // Projects is the page's first look.
  pageColour: 'themeColour',
  // The cover: six seconds on each tab, each a full turn of the hue wheel (Hue from window, as if
  // the window sat mid-screen, from pistachio at offset 317). The demo switch fires every 6 s;
  // starting 13 s in puts the switches 1 s before each side's turn begins (a switch takes ~0.7 s),
  // and Projects at the first frame. Two switches and two turns per clip, so it loops.
  capture: {
    seconds: 12, start: 13, pingpong: false,
    set: { windowHue: true, autoSwitch: 6 },
    cycle: { windowHueOffset: [317, 1037] },
  },
};
