export const BLOCKS_DTS = `
/** A reusable block selection, resolved by Blocks.palette. */
type BlockPalette = { preset: string; include: string[]; exclude: string[]; replace: Record<string,string> };
type MinecraftUsername = string;
type MultiSelect<T extends string> = T[];
type ToolFile = { data: Uint8Array; format?: string; metadata?: { name?: string; mimeType?: string } };
type BuildTimeline = Nucleation.BuildAnimation;
type SimulationView = Nucleation.TickSimulation;
type ChartData = { labels: string[]; values: number[]; title?: string };

declare const Blocks: {
  palette(choice?: object): any;
  image(file: unknown, width?: number): Promise<any>;
  /** Profile lookup and PNG decoding only; construct geometry in the graph. */
  skin(username: string): Promise<{ name: string; slim: boolean; image: { width: number; height: number; data: Uint8ClampedArray } }>;
  pixelArt(image: any, palette: any, orientation?: string, dither?: boolean): Schematic;
  statue(skin: any, palette: any, scale?: number, overlay?: string, parts?: string[]): Schematic;
  measure(schematic: unknown): { dimensions: number[]; block_count: number; blocks_used: object; palette_size: number; placed: number };
  export(schematic: unknown, format?: string): { base64: string; format: string };
};`;
