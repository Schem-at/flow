import { loadedNucleationModule } from './schematic.js';

/** Keep public Nucleation class instances alive in the worker, without inspecting pointers. */
export function nativeValueType(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;
  const module = loadedNucleationModule();
  if (!module) return null;
  for (const [name, Type] of Object.entries(module)) {
    if (typeof Type === 'function' && Type.prototype && value instanceof Type) return name;
  }
  return null;
}

export function isNativeSchematic(value: unknown): value is { toSchematicB64(): string } {
  return nativeValueType(value) === 'Schematic';
}

export function nativeSchematicBytes(value: { toSchematicB64(): string }): Uint8Array {
  const binary = atob(value.toSchematicB64());
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}
