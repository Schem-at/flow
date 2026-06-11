/**
 * Type declarations for the nucleation module
 */

declare module 'nucleation' {
  export interface SchematicWrapper {
    set_block(x: number, y: number, z: number, blockType?: string): void;
    get_block(x: number, y: number, z: number): string;
    to_schematic(): Uint8Array;
    size?: { x: number; y: number; z: number };
  }

  export const SchematicWrapper: new () => SchematicWrapper;

  export default function initNucleation(
    input?: RequestInfo | URL | Response | BufferSource
  ): Promise<void>;
  
}


