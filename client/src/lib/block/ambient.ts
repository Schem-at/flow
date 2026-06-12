/**
 * Ambient declarations shipped to Monaco (autocomplete/hover) and consulted by
 * the parser to recognize widget helper type names.
 *
 * Widget helpers (Slider, NumberField, …) are *type-level only*: they erase to
 * their primitive (number/string/boolean) at runtime, but their generic config
 * argument carries UI metadata (min/max/step/default) that the parser lifts
 * into FlowType descriptors.
 */

export const AMBIENT_DTS = `
// ---- Widget helper types (erased at runtime; config drives the UI) ----

/** A number edited with a slider widget. */
declare type Slider<C extends { min?: number; max?: number; step?: number; default?: number } = {}> = number;

/** A number edited with a plain numeric input widget. */
declare type NumberField<C extends { min?: number; max?: number; step?: number; default?: number } = {}> = number;

/** A string edited with a multiline textarea widget. */
declare type Textarea<C extends { default?: string } = {}> = string;

/** A boolean edited with a toggle widget. */
declare type Toggle<C extends { default?: boolean } = {}> = boolean;

/** A minecraft block id, edited with the block picker widget. */
declare type Block<C extends { default?: string } = {}> = string;

/** An [x, y, z] vector. */
declare type Vec3 = [number, number, number];

// ---- Ambient runtime context (provided by the engine; loose on purpose) ----

/** A 3D voxel schematic (nucleation). */
declare class Schematic {
  constructor(...args: any[]);
  set_block(x: number, y: number, z: number, blockId: string): any;
  get_block(x: number, y: number, z: number): any;
  get_dimensions(): [number, number, number];
  blocks(): any;
  copy(...args: any[]): any;
  [key: string]: any;
}

/** A 2D RGBA image. */
declare class Image {
  constructor(...args: any[]);
  width: number;
  height: number;
  data: any;
  [key: string]: any;
}

declare const Logger: any;
declare const Noise: any;
declare const Vec: any;
declare const Calculator: any;
declare const Easing: any;
declare const Progress: any;
declare const Pathfinding: any;
declare const SchematicUtils: any;

/**
 * Schemati platform API — search and fetch schematics hosted on schemati.
 * In the browser it rides the page's session (same-origin); on the server it
 * uses SCHEMATI_URL / SCHEMATI_API_TOKEN. Blocks call it the same way in both.
 */
declare const Schemati: {
  /** Search schematics; tag accepts a tag NAME (e.g. 'door') or tag id. */
  searchSchematics(options?: { tag?: string; search?: string; limit?: number; page?: number }): Promise<Array<{
    id: string; shortId: string; slug: string; name: string; description: string;
    format: string; isPublic: boolean; tags: string[]; authors: string[];
    previewImageUrl: string | null; webUrl: string | null;
  }>>;
  /** Download a schematic (by id, short id, or slug) as a live Schematic. */
  getSchematic(idOrSlug: string, options?: { format?: string }): Promise<Schematic>;
  /** Download raw bytes + metadata instead of a parsed Schematic. */
  getSchematicData(idOrSlug: string, options?: { format?: string }): Promise<{ format: string; data: any; metadata: { name: string } }>;
  /** List all tag names on the platform. */
  getTags(): Promise<string[]>;
};
`;

/** Type-reference names the parser maps to widget-configured primitives. */
export const WIDGET_HELPER_NAMES = ['Slider', 'NumberField', 'Textarea', 'Toggle'] as const;

/** Type-reference names the parser maps to domain FlowType kinds. */
export const DOMAIN_TYPE_NAMES = ['Schematic', 'Block', 'Image', 'Vec3'] as const;
