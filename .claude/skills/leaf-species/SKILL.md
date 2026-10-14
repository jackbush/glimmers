---
name: leaf-species
description: Add, edit or rename a species preset in the Leaf glimmer (src/sketches/leaf/params.js `presets`) — a tree's leaf, stem, fruit, flowers and colours. Use whenever the user asks for a new tree or plant in Leaf, wants a species to look more like itself, or names, renames or reorders presets. Covers horticultural naming conventions, the comment and colour rules, and how to check the result by eye.
---

# Leaf species presets

Read `src/sketches/leaf/NOTES.md` (Species presets, Fruit and flowers, Trees Leaf can't draw) first. If the tree needs something the engine has no control for, build the part (`glimmers-elements`) or add it to Trees Leaf can't draw, not a half-right preset: Monkey puzzle, Lawson cypress and others were cut because they didn't read as themselves.

## Naming: horticultural conventions

Preset names are what a tree guide's index would print.

- **Use the established common name** (RHS, Collins and other UK tree guides), not a translation of the botanical name or a made-up one. The botanical name goes in the comment.
- **Invert a qualified name with a comma**, the index form, so relatives sit together in the menu: English oak → `Oak, English`; Field maple → `Maple, Field`; Silver birch → `Birch, Silver`; Crab apple → `Apple, Crab`. Capitalise both parts.
- **Invert by the name, not by botany.** Horse chestnut (*Aesculus*) and Sweet chestnut (*Castanea*) aren't related, but both are `Chestnut, …`, as an index lists them.
- **Leave one-word names alone**: Holly, Sycamore, Robinia, Eucalyptus. Sycamore is botanically a maple, but nobody calls it one.
- **Don't invent qualifiers**, unless a second preset would share the name. Adding a second cherry turned `Cherry` into `Cherry, Wild` beside the new `Cherry, Japanese 'Kanzan'`.
- **Cultivars** go in single quotes after the species name: `Maple, Japanese 'Bloodgood'`. Hybrids keep the × in the comment (*Tilia × europaea*).
- **Order:** `presets` is in alphabetical order by name, because that is the menu order. Insert new presets in place.
- **Quoting:** keys with spaces or commas are quoted: `'Oak, English': species({`.

### Renaming a preset

- Update `manifest.js`: `capture.presets.sequence` (`check.mjs` errors if it names a missing preset).
- Update every mention of the old name in `NOTES.md`. In docs, write inverted names in backticks (`` `Oak, English` ``) so lists stay readable.
- Then move the block to its new alphabetical place.
- The kit doesn't save preset names, so renames break nobody's settings.

## The preset block

```js
  // English oak (Quercus robur): what the leaf, twig, bud and fruit look like, in a sentence
  // or two of plain description. Leaf colour.
  'Oak, English': species({
    compound: …, outline: …,                     // the Leaf, Lobes, Margin, Veins, Stalk, Stem
    …                                            // Fruit and Flowers groups, as others lay them out
    leafWash: '#…', leafShade: '#…',
    stemWash: '#…', budColour: '#…', budShade: '#…',
    fruitColour: '#…', fruitShade: '#…', flowerColour: '#…', flowerShade: '#…', flowerCentre: '#…',
  }),
```

- **The comment** gives the common name in natural order, then the botanical name in brackets, then a colon. After that, the look in a sentence or two, and finally the colours.
- **What `species()` covers:** it fills every shape param (all groups but Finish) from the defaults, so name only what makes this tree itself. Never set Finish params (outline, shading, wash), because a user's Finish must survive picking a species.
- **Colours:**
  - Use summer colours unless autumn is the point.
  - Don't set the paper: every preset shares the warm cream default.
  - Set fruit and flower colours only when there's fruit or flowers. The acorn cup uses the bud colours; a bract has its own `bractColour`.
- **Odd parts:** Thorns (and Terminal Thorn) for hawthorn, blackthorn, robinia; Outline Fan + Venation Forking for ginkgo; Apex Cut for the tulip tree; Palmate with many leaflets and Tip flop for palms; Petal rings for double blossom.
- **Nodes:** 3–15 for a broadleaf, never 2 (it looks unfinished). Up to 15 keeps leaves at full resolution; from 16 they step down (fine for needles, not for big toothed leaves).
- **Conifers** (see NOTES Long shoots): Outline Needle, no side veins (Vein weight 0), a short internode, dozens of nodes. Two ranks: Alternate, Divergence 180; spirals: 137.5 with Foreshorten; bundles: Per node, Bundle fan, Sheath; spruce's Pegs; Base shrink for small-at-both-ends shoots. Decide which side is up: stomatal bands are on the underside of most flat needles, so a shoot seen from above (yew) shows none. Spread out 0, since they're meant to be dense, and Every to space fruit along the shoot. Larch and cedar tufts are Spurs (a rosette on a knob every nth node); branched sprays are Side shoots. Cones are a Fruit type.
- **Fruit and flowers** (see NOTES Fruit and flowers):
  - A preset may show both seasons at once, as a botanical plate does (Elder: flowers at the tip, berries lower down). Keep them apart: flowers count their nodes from the tip down, fruit from the base up.
  - Put them where they read, in open space off the leaves; small clusters at a dense tip get lost. Hang and Cluster stalk move them out.
  - Pick the Cluster form the tree has: Fan for pairs and umbels (cherries, maple keys on a Cluster stalk), Raceme for chains and candles (laburnum, horse chestnut, plane balls with Fruit stalk 0), Corymb for flat or domed heads (elder, rowan, whitebeam).
  - Use Fruit length or Flower length for elongated fruit, petals and catkins; Curve for drooping chains and catkins.
  - Leave Gloss off for dry fruit.

## Check it

1. `node scripts/check.mjs leaf` should report 0 errors.
2. Look at it: `node scripts/capture.mjs leaf --still <scratchpad>/x.png --preset 'Oak, English' --size 800x800 --dpr 2`, then read the PNG. Crop in on fruit, buds and margins at `--dpr 4`, because details that matter are small. Compare it with the tree, not just with the other presets.
3. Morph to it from a very different preset and check that nothing jumps.
4. Update `NOTES.md`: the count of presets, which ones are in autumn colour, anything new about fruit, and Trees Leaf can't draw if this retires an entry.
5. If the preset is in the cover sequence, offer to recapture the cover (`publish-glimmer`).
