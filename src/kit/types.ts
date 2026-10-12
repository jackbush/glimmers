// Shared types for the kit and the sketches. Sketches are plain JS; these are for
// JSDoc (`@type {import('../../kit/types').Sketch}`) and the kit's own TypeScript.

export type ParamType = 'range' | 'color' | 'bool';
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
  desc?: string;
  uniform?: boolean;
  [extra: string]: unknown;
}

export interface Group {
  group: string;
  params: ParamDef[];
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
   * applied: dt is 0 while paused); `rt` is real seconds, which always runs. Must not allocate.
   */
  frame(t: number, dt: number, rt: number): void;
  dispose?(): void;
}

export type Sketch = (ctx: SketchContext) => SketchInstance;

export interface Manifest {
  /** Shown as "Name (Year)" in the index caption and the tab title. */
  name: string;
  /** The year the sketch was first made. */
  year: number;
  /** Key of a colour param that drives the page background and theme-color. */
  pageColour?: string;
  /** Defaults for scripts/capture.mjs, so re-captures match. */
  capture?: {
    seconds?: number;
    start?: number;
    fps?: number;
    crf?: number;
    pingpong?: boolean;
    /** Params to sweep during the clip: from → to and back, eased, over the whole clip. */
    animate?: Record<string, [number, number]>;
  };
}
