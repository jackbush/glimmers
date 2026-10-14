// Shared types for the kit and the sketches. Sketches are plain JS; these are for
// JSDoc (`@type {import('../../kit/types').Sketch}`) and the kit's own TypeScript.

import type { z } from 'astro/zod';
import type { manifestSchema } from './manifest-schema.js';

export type ParamType = 'range' | 'color' | 'bool' | 'select';
export type ParamValue = number | string | boolean;

/** One entry in a sketch's params.js. Extra fields (e.g. Blackstar's `uniform`) are allowed. */
export interface ParamDef {
  key: string;
  label: string;
  value: ParamValue;
  type?: ParamType;
  min?: number;
  max?: number;
  step?: number;
  /** Select params only: the choices, in menu order. The value is one of these strings. */
  options?: string[];
  desc?: string;
  uniform?: boolean;
  /**
   * Only relevant when another param (its parent) has one of the `is` values, or none of the
   * `not` values. The pane shows it only then (indented, under the parent), and only shown
   * params count as changes or are copied. The parent must come earlier in the same group,
   * with nothing unrelated between them: scripts/check.mjs enforces it.
   */
  when?: { key: string; is?: ParamValue[]; not?: ParamValue[] };
  [extra: string]: unknown;
}

/**
 * Named sets of param values a sketch offers (params.js: `export const presets`). Picking
 * one morphs to it: numbers and colours glide, selects and bools switch.
 */
export type Presets = Record<string, Record<string, ParamValue>>;

/** A group of params as written in params.js (`ParamDef`), or as the kit holds them live (`Param`). */
export interface Group<T extends ParamDef = ParamDef> {
  group: string;
  params: T[];
}

/** A live param: its def plus the current value, the code default and derived values. */
export interface Param extends ParamDef {
  type: ParamType;
  group: string;
  default: ParamValue;
  /**
   * What "unchanged" means for it: the default, or the value the last preset to set it gave it.
   * A preset's params are clean after it lands, other params keep theirs; edits are counted
   * (and copied) against this.
   */
  base: ParamValue;
  decimals: number;
  /** The param `when` depends on, and how many such levels deep this one is (0 = none). */
  parent: Param | null;
  depth: number;
  /** Colour params only: the value as 0–1 floats, updated in place on every edit. */
  rgb: Float32Array;
}

export interface Model {
  params: Param[];
  byKey: Record<string, Param>;
  /** Bumped on every edit, so a sketch can re-upload only when it's behind. */
  readonly version: number;
}

export interface SketchContext {
  canvas: HTMLCanvasElement;
  /** Params by key: `P.orbRadius.value`. */
  P: Record<string, Param>;
  model: Model;
  /** Lower the adaptive resolution scale, e.g. after a lost GPU context. */
  degrade(factor: number): void;
}

export interface SketchInstance {
  /** The canvas's pixel size changed. `pxRatio` = canvas px per CSS px. */
  resize(width: number, height: number, pxRatio: number): void;
  /**
   * Draw one frame. `t` and `dt` are scene time and its step (Speed and the play/pause button
   * applied: dt is 0 while paused); `rt` is real seconds, which always runs, and `rdt` its
   * step (for things that move while paused, like a preset morph). Must not allocate.
   */
  frame(t: number, dt: number, rt: number, rdt: number): void;
  /**
   * Optional: the sketch morphs presets itself. A preset's numbers and selects then land at
   * once (colours still glide), and this is called to morph from what's on screen to them over
   * `seconds`, so it can work out where everything ends up first and move there on one curve.
   * `name` is the preset's (the page's first preset is announced with seconds 0, once the
   * sketch exists).
   */
  morph?(seconds: number, name: string): void;
  /**
   * Optional: how long a morph from what's on screen to these preset values should take, so a
   * small change can be quick and a big one slow. Without it, presets take the manifest's
   * presetSeconds. (Capture keeps its own timing.)
   */
  presetSeconds?(values: Record<string, ParamValue>): number;
}

export type Sketch = (ctx: SketchContext) => SketchInstance;

/** A sketch's manifest.js: see manifest-schema.js. */
export type Manifest = z.input<typeof manifestSchema>;
