# Leaf: trees we can't draw yet

Everything in `presets` (params.js) is buildable from today's controls. The trees below aren't: the conifers that need short shoots, scale leaves or cones, plus a few broadleaves with something the engine has no part for. Fruit (berries, drupes, nuts in cups, keys, pods, burrs) exist now; where a tree below needs one, it says which type. For each one: what it looks like, a palette in the presets' format (summer colours, and a very pale paper from across the colour wheel), and what the engine is missing. The features they need are listed by how many trees each one unlocks, at the end.

Palettes are `leafWash / leafShade · stemWash · budColour / budShade · paper`. Where a tree has no bud worth drawing, the "bud" colours are for whatever feature ends the sprig (a cone, an aril).

## Conifers

Yew, `Fir, Silver`, `Redwood, Coast`, `Pine, Scots`, `Spruce, Norway` and Juniper are presets now (many leaves per sprig, stomatal bands, two ranks, foreshortened spirals, bundles with sheaths, pegs, Base shrink). What they still lack: cones (pine, spruce, fir; see Cones below), spruce's four-sided needles (a ridge down the middle, shaded either side, rather than a flat blade with a midrib), and redwood's second kind of foliage, scale leaves pressed to its leading shoots.

### European larch (Larix decidua)
- **Look:** soft, bright fresh-green needles, 2–3 cm. They come in tufts of 20–40 on knobbly short side shoots, and singly, spiralled, on the season's long shoot. A deciduous conifer, so they turn gold in autumn. Pale straw-yellow shoots; small cones like wooden rosebuds sit upright along the branches.
- **Palette:** `#8fb257 / #3e5e28 · #c8a76a · #8a6040 / #3a2416 · #f3eff9` (spring green on lilac).
- **Missing:** rosettes (a fan of many needles from one knob on a short shoot), short shoots off the main stem, and cones (overlapping scales; no fruit type draws them).

### Cedar of Lebanon (Cedrus libani)
- **Look:** like larch but evergreen, stiffer and darker: rosettes of 10–15 dark grey-green needles, 2–3 cm, on short shoots, held in flat tiers. Barrel-shaped cones stand upright.
- **Palette:** `#5f7a6a / #253a30 · #7a6a5a · #8a7a5a / #3a3020 · #faf0ea` (grey-green on pale peach).
- **Missing:** rosettes and short shoots (as larch), and cones.

### Lawson / Leyland cypress (Chamaecyparis, × Cuprocyparis)
- **Look:** no needles: tiny scale leaves, 1–2 mm, clasping the shoot in opposite pairs, so each shoot looks like a flattened braided cord. Shoots branch repeatedly in one plane into flat, fern-like sprays, drooping at the tips. Lawson's undersides have faint white X marks. Dull to bright green; round cones the size of a pea.
- **Palette:** `#5e8a52 / #23421f · #6a5a3a · #7a6a4a / #2e281a · #f7eef6` (green on orchid).
- **Missing:** scale leaves (a shoot drawn as overlapping scales, not as separate leaves), branching sprays (side shoots off side shoots, in one plane), and cones.

### Monkey puzzle (Araucaria araucana)
- **Look:** thick, leathery, triangular leaves, 3–4 cm, ending in a sharp spine. They overlap in tight spirals that cover the branch completely, so the branch reads as a scaly green rope. Glossy dark green; they last for decades.
- **Palette:** `#3e6a3a / #16301a · #5a6a3a · #6a6a3a / #2a2a14 · #f9eef2` (dark green on rose).
- **Missing:** overlapping scale leaves on a thick shoot (as cypress, but large, and with a draw order that lets each scale overlap the next), and dense spiral placement.

## Broadleaves with a missing part

### Ginkgo (Ginkgo biloba)
- **Look:** a leathery fan, 5–8 cm across, often split into two lobes by a notch in the middle of its wavy outer edge. Fine veins fork again and again from the stalk out to the edge, with no midrib. Long stalks, the leaves in tufts of 3–5 on stubby short shoots. Fresh mid-green; brilliant butter-yellow in autumn.
- **Palette:** `#8aab55 / #3e5a28 · #8a7a5a · #7a6a4a / #2e2818 · #f2eff9` (green on lilac; autumn `#e8c64a / #9a7a1a` on `#eef0fa`).
- **Missing:** a fan outline (a wedge widening to a broad arc, not a midrib-based blade), forking (dichotomous) venation, and tufts on short shoots.

### Hawthorn (Crataegus monogyna)
- **Look:** small leaves, 2–4 cm, wedge-based and cut deep, almost to the midrib, into three to five lobes, the lowest pair the deepest; a few teeth near the lobe tips only; leafy, toothed stipules at the stalk's base. Alternate on a zigzag twig, with straight sharp thorns, 1–2 cm, at the nodes, the same brown as the twig. In autumn, clusters of dark red haws.
- **Palette:** `#5e8e44 / #28482a · #6a4a3a · #8a3a2a / #3a1408 · #f9eff2` (deep green on rose, the haws dark red).
- **Missing:** thorns (a short tapering spike at each node, its own placement); the haws are a corymb of Berries, the may an Open corymb (white, five petals, pink anthers). It was a preset (pinnately lobed, Lobe depth 0.75, 3 lobes) and was cut: without its thorns, and with lobes cut that deep at that size, it read as a scrappy generic leaf. Bring it back with thorns, and look again at deep pinnate lobes on small leaves.

### Tulip tree (Liriodendron tulipifera)
- **Look:** squarish, 10–15 cm, with four pointed lobes: two at the base, broad and spreading, and two at the top either side of a tip cut straight across, as if snipped off with scissors (a shallow V, not a dent). The base is broad and nearly straight. Long stalk; a flat, duck-bill bud.
- **Palette:** `#7aa452 / #33582e · #7a5a3a · #6a6a5a / #2a2a1e · #f3eff9` (fresh green on lilac).
- **Missing:** a cut-off apex (the blade ending in a broad, shallow V between two points; Notched is only a small dent in a pointed tip), and four lobes placed two at the base and two at the top (palmate lobing spreads them evenly round the palm). It was a preset and was cut: Orbicular + 4 palmate lobes + Notched read as a generic lobed leaf.

### Blackthorn (Prunus spinosa)
- **Look:** small, dull, finely toothed oval leaves, 2–4 cm, on dark purple-black twigs that end in long thorns. Blue-black sloes with a grey bloom.
- **Palette:** `#5a7a48 / #24381f · #2e2026 · #3a3a5a / #14141e · #faf0ea` (dull green on peach, the twigs near black).
- **Missing:** a thorn-tipped stem (the sprig ending in a thorn rather than a bud) and side thorns. The sloes are a Berry (or Drupe) in blue-black with gloss off.

### Chusan palm (Trachycarpus fortunei)
- **Look:** a fan up to a metre across, split into 40–50 stiff, pleated, strap-shaped segments radiating from one point at the top of a long, toothed stalk; the segment tips flop over. Dark green above, grey-green beneath. Brown fibre wraps the trunk.
- **Palette:** `#3f6a3a / #183018 · #6a5a3a · #7a5a3a / #2e2010 · #f5eff9` (dark green on lilac).
- **Missing:** many palmate segments (Palmate tops out at 15 leaflets), pleating (a fold line down each segment, shaded on one side), and floppy tips (the bend reversing near each segment's end). A palm frond is one leaf, not a sprig, so it would use No stem.

## Fruit, flowers and catkins (for trees we already have)

Done: fruit on 21 presets and flowers on 11, in fans, racemes and corymbs (see NOTES.md, Fruit and flowers). Still missing: hawthorn's may blossom and haws (it needs thorns first), sycamore's keys in long hanging racemes of pairs (a raceme of pairs, not of single items), ash's keys in dense branched bunches (a panicle: racemes on a raceme), catkins drooping more softly than an arc (a catkin is one stiff curve now), double blossom (cultivars like 'Kanzan', petals in more than one ring), and flowers seen from the side or the back among the face-on ones.

## Features, by how many trees they unlock

| Feature | What it is | Unlocks |
|---|---|---|
| Cones | Overlapping scales, as a fruit type (fruit themselves are done) | Larch, Cedar, Cypress, `Pine, Scots`, `Spruce, Norway`, `Fir, Silver`, Alder |
| Four-sided needles | A ridge down the middle of a needle, shaded either side | `Spruce, Norway` |
| Rosettes on short shoots | A fan of many needles (or a few leaves) from one knob on a short side shoot | Larch, Cedar, Ginkgo |
| Scale leaves | A shoot covered in overlapping clasping scales instead of separate leaves | Cypress, Monkey puzzle, Coast redwood (leading shoots) |
| Branching sprays | Side shoots, and side shoots off those, in one plane | Cypress, Larch, Cedar |
| Thorns | Spikes at nodes, or a thorn ending the sprig | Hawthorn, Blackthorn, Robinia (better than stipules) |
| Cut-off apex and placed lobes | A tip cut across in a shallow V; lobes at chosen positions, not spread evenly | Tulip tree |
| Fan outline and forking veins | A wedge-to-arc blade with dichotomous venation | Ginkgo |
| More palmate segments and pleating | Up to ~50 segments, each folded down its length | Chusan palm |

## Roadmap

In build order. Stages 1–2 only add placed elements, so they improve nearly every current preset without touching the vertex budget; 3 changes the buffers and unlocks the most new trees; 4–5 build on 3.

1. **Fruit at nodes and the tip.** Done: the Fruit group (Berry, Drupe, Nut, Key, Pod, Burr), clusters fanned from a stalk in the axils and at the tip, morphing like everything else (see NOTES.md). On 15 presets, plus `Apple, Crab` and `Oak, Holm`, new for it. Gives the yew aril, sloes, juniper berries and hawthorn haws once their other features land.
2. **Clusters on branching stalks (fruit and flowers).** Done: the Flowers group (Open, Cup, Pea, Catkin) beside Fruit, both with a Cluster form (Fan, Raceme, Corymb), curving axes, bracts. Rowan, Elder, Whitebeam and Dogwood berry heads; laburnum and robinia pods and flower chains; plane balls on a thread; `Cherry, Japanese` (new) blossom, magnolia, elderflower, horse chestnut candles, lime flowers on their bracts; catkins on Hazel, `Birch, Silver`, Alder and Willow. May waits for thorns; panicles (ash keys) and raceme-of-pairs (sycamore) are left, above.
3. **Many cheap leaves.** Done: up to 120 nodes and 320 leaves a sprig, their resolution stepping down on long shoots; Per node and Bundle fan with a Sheath, Pegs, Foreshorten, Base shrink, stomatal bands, Every for fruit and flowers along a long shoot. New: Yew, `Fir, Silver`, `Redwood, Coast`, `Pine, Scots`, `Spruce, Norway`, Juniper; Box, Willow and Eucalyptus on longer, denser shoots.
4. **Short shoots and side branches.** Spur knobs carrying rosettes, side shoots in one plane. Cedar, larch, ginkgo; spur clusters on Cherry; side twigs carrying fruit.
5. **Overlapping scales.** One feature for cones (pine, cedar's barrel, larch's rosebud, alder's little cones) and scale leaves (cypress sprays, monkey puzzle).
6. **One-offs.** Thorns (Hawthorn, Blackthorn, Robinia), cut-off apex (Tulip tree), fan blade with forking veins (Ginkgo), pleated segments (Chusan palm).
