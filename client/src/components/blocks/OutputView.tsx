/**
 * <OutputView> — renders each output of a run via its registered viewer
 * (schematic 3D, image, list→table/gallery, object→grouped, primitives).
 * Decoupled from flowStore/React-Flow for reuse in the node editor.
 */

import type { BlockContract } from '@flow/core';
import { FieldViewer } from './viewers';

export interface OutputViewProps {
  contract: BlockContract;
  /** The `generate` return value, keyed by output name. */
  result: Record<string, unknown> | null;
  /** Serialized schematic bytes per output name (worker-provided), preferred over raw values. */
  schematics?: Record<string, unknown>;
  /** Resolve worker data handles to bytes. */
  getData?: (handleId: string) => Promise<unknown>;
}

export default function OutputView({ contract, result, schematics, getData }: OutputViewProps) {
  if (!result) {
    return <p className="text-xs text-neutral-500">Run the block to see outputs.</p>;
  }

  const names = Object.keys(contract.outputs);
  const extraNames = Object.keys(result).filter((k) => !names.includes(k));

  return (
    <div className="space-y-4">
      {names.map((name) => {
        const type = contract.outputs[name];
        const value =
          type.kind === 'schematic' && schematics?.[name] !== undefined
            ? schematics[name]
            : result[name];
        return (
          <section key={name}>
            <p className="mb-1.5 flex items-baseline justify-between">
              <span className="text-xs font-medium text-neutral-300">{name}</span>
              <span className="text-[10px] uppercase tracking-wide text-neutral-600">
                {type.kind}
              </span>
            </p>
            <FieldViewer type={type} value={value} getData={getData} />
          </section>
        );
      })}
      {extraNames.length > 0 && (
        <section>
          <p className="mb-1.5 text-xs font-medium text-neutral-500">Undeclared outputs</p>
          <FieldViewer
            type={{ kind: 'unknown' }}
            value={Object.fromEntries(extraNames.map((k) => [k, result[k]]))}
            getData={getData}
          />
        </section>
      )}
    </div>
  );
}
