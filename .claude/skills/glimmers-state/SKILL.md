---
name: glimmers-state
description: Apply a pasted glimmers state blob to a sketch's defaults. Use whenever the user pastes JSON containing "glimmers": "state@1" (copied from a sketch's "Copy changes" button), or asks to bake/apply/save their tweaked settings into a glimmer's defaults.
---

# Applying a glimmers state blob

The settings pane's **Copy changes** button produces this:

```json
{
  "glimmers": "state@1",
  "sketch": "blackstar",
  "changed": {
    "orbRadius": { "from": 0.19, "to": 0.24 },
    "haloOuter": { "from": "#d2260c", "to": "#aa1100" }
  }
}
```

- `sketch` is the folder: every default lives in `src/sketches/<sketch>/params.js`.
- Old blobs may carry `paused`: it isn't a param any more (it's the play/pause button), so skip it and say so.
- `changed` holds every param that differs from its base at the moment of copying. An entry may also carry `range: [min, max]`: the user re-centred that slider in the pane (the ↔ button). The base is the code default, unless the blob has a `preset`: then it's that preset's value for the params the preset sets (the default for the rest). `from` is the base the user's page was running. `to` is what they want.
- A blob with `"preset": "Name"` was copied while that preset was applied: the user tweaked the preset. Changes to keys the preset sets belong in that preset's entry in `presets` (params.js); changes to other keys (Finish, playback) go to the defaults as usual. If it's unclear whether they meant to change the preset or the defaults, ask.
- The user's intent, if any, is in the chat message around the blob.
- Old Blackstar blobs (`"blackstar": "blackstar/state@1"`, no `sketch`) are for `blackstar`. Their keys still apply.

## Where a default lives

- Most params are literal entries in `params.js`: edit the `value:` field.
- **Standard keys** (`timeScale`, `renderScale`, `targetFps`, `maxDpr`) come from `playback()` in `src/kit/standard.js`. Set them through the first argument of the sketch's `playback()` call, e.g. `playback({ timeScale: 0.41 }, …)`. Never edit `standard.js` for one sketch's value.

## Procedure

1. **Read the sketch's `params.js`** in full. Don't rely on memory, because the defaults may have moved since the last session.
2. **Reconcile each entry in `changed`:**
   - **Key exists, `from` equals the current default:** set the value to `to`.
   - **Key exists, `from` differs from the current default:** the code changed after the user copied. Still apply `to`, since that's what they saw and liked, but list it in your reply as "default had moved: X → (now) Y → applied Z".
   - **Entry has `range`:** set the param's `min`/`max` to it (rounded to clean numbers that still contain `to`, and the default, with some headroom). Mention the new range.
   - **`to` is outside `min`/`max`** (and no `range`): the user typed past the slider range in the number box. Apply it and widen `min`/`max` so the slider covers it with some headroom (round to a clean number). Mention that you widened it.
   - **Key doesn't exist:** the param was renamed or removed. Check `git log -p -S'<key>' -- src/sketches/<sketch>/params.js` for a rename. If one is obvious, apply the value to the new key and say so; otherwise report the key as skipped.
   - **Formats:** colours are lowercase `#rrggbb`. Numbers keep the param's `step` precision, so never write `0.30000000000000004`. Bools are `true`/`false`.
3. **Change nothing else in `params.js`.** Keep each param's position, label, desc and formatting, and edit only the value (plus `min`/`max` when widening or applying a `range`).
4. **Act on the accompanying message.** Phrases like "a bit hotter" or "slower" usually map to existing params, so adjust them and say which ones and by how much. If it asks for a new visual element, behaviour, or a removal, follow the `glimmers-elements` skill. If it's ambiguous, apply the numeric changes first and then ask about it. Don't stall the whole update on it.
5. **Verify:** run `node scripts/check.mjs <sketch>`. It must report 0 errors.
6. **Cover:** if the change is visible in the first few seconds, the cover is now out of date. Say so, and offer to run `node scripts/capture.mjs <sketch>`.
7. **Reply briefly** with:
   - a compact table of what changed: key · old default → new default
   - anything reconciled (moved defaults, widened ranges, skipped keys)
   - what you did about the accompanying message

## After applying

The page stores the user's overrides in localStorage (`glimmers:<sketch>:overrides`), signed with a hash of all the sketch's code defaults. Changing any default invalidates the signature, so on reload the page starts clean on the new defaults. The user doesn't need to press Reset. Tell them to reload (or that the deployed site will pick it up after the push).

## Don'ts

- Don't edit `sketch.js` or the kit for a pure value update.
- Don't "tidy" or round other params while you're in the file.
- Don't treat values in `from` as targets. They only detect drift.
