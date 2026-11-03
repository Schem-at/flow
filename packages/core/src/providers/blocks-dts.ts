export const BLOCKS_DTS = `
/** A reusable block selection, resolved by Blocks.palette. */
type BlockPalette = { preset: string; include: string[]; exclude: string[]; replace: Record<string,string> };
type MinecraftUsername = string;
type MultiSelect<T extends string> = T[];
type ToolFile = { data: Uint8Array; format?: string; metadata?: { name?: string; mimeType?: string } };
type BuildTimeline = Nucleation.BuildAnimation;
type SimulationView = Nucleation.TickSimulation;
type ChartData = { labels: string[]; values: number[]; title?: string };

/** Decoded RGBA pixels (row-major, 4 bytes per pixel), as Blocks.image / Blocks.skin return them. */
type PixelImage = { width: number; height: number; data: Uint8Array | Uint8ClampedArray };
/** A palette choice resolved against Nucleation: the matcher, block replacements and the chosen ids. */
type ResolvedPalette = { palette: Nucleation.Palette; replace: Record<string, string>; ids: string[] };
type SkinProfile = { name: string; slim: boolean; image: PixelImage };

declare const Blocks: {
  palette(choice?: Partial<BlockPalette>): ResolvedPalette;
  image(file: unknown, width?: number): Promise<PixelImage>;
  /** Profile lookup and PNG decoding only; construct geometry in the graph. */
  skin(username: string): Promise<SkinProfile>;
  pixelArt(image: PixelImage, palette: ResolvedPalette, orientation?: string, dither?: boolean): Schematic;
  statue(skin: SkinProfile, palette: ResolvedPalette, scale?: number, overlay?: string, parts?: string[]): Schematic;
  measure(schematic: unknown): { dimensions: number[]; block_count: number; blocks_used: Record<string, number>; palette_size: number; placed: number };
  export(schematic: unknown, format?: string): { base64: string; format: string };
};`;
