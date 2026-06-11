/**
 * <InputForm> — generated from the Inputs contract. Fills in VALUES to run a
 * block (distinct from <ContractBuilder>, which defines the contract).
 * Decoupled from flowStore/React-Flow so the node editor can mount it as-is.
 */

import type { BlockContract } from '@flow/core';
import { FieldWidget } from './widgets';
import { getTypeEntry } from './registry';

export interface InputFormProps {
  contract: BlockContract;
  values: Record<string, unknown>;
  onChange: (values: Record<string, unknown>) => void;
}

export default function InputForm({ contract, values, onChange }: InputFormProps) {
  const entries = Object.entries(contract.inputs);
  if (entries.length === 0) {
    return <p className="text-xs text-neutral-500">This block takes no inputs.</p>;
  }

  return (
    <div className="space-y-3">
      {entries.map(([name, type]) => {
        const error = getTypeEntry(type.kind).validate(type, values[name]);
        return (
          <div key={name}>
            <label className="mb-1 flex items-baseline justify-between">
              <span className="text-xs font-medium text-neutral-300">{name}</span>
              <span className="text-[10px] uppercase tracking-wide text-neutral-600">
                {type.kind}
              </span>
            </label>
            <FieldWidget
              type={type}
              value={values[name]}
              onChange={(v) => onChange({ ...values, [name]: v })}
            />
            {error && <p className="mt-0.5 text-[11px] text-amber-500">{error}</p>}
          </div>
        );
      })}
    </div>
  );
}
