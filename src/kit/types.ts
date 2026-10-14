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
  decimals: number;
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
   */
  morph?(seconds: number): void;
}

export type Sketch = (ctx: SketchContext) => SketchInstance;

/** A sketch's manifest.js: see manifest-schema.js. */
export type Manifest = z.input<typeof manifestSchema>;
