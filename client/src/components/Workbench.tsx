/**
 * Workbench — an isolated page for authoring and running a SINGLE code block
 * as a standalone script. No flow graph, no backend, no persistence.
 *
 * Edit the code on the left, run it via the client-side synthase worker, and
 * inspect the result / schematic preview / logs on the right.
 */

import { useState, useCallback, useEffect, useMemo } from 'react';
import Editor from '@monaco-editor/react';
import { Play, Loader2 } from 'lucide-react';
import { useScriptRunner } from '../hooks/useScriptRunner';
import { extractIoDefaults } from '../lib/codeBlock';
import SchematicRenderer from './others/SchematicRenderer';

const DEFAULT_CODE = `export const io = {
    inputs: {
        length: { type: 'number', default: 5, description: 'length of the bus' },
        material: {
            type: 'string',
            default: 'minecraft:gray_concrete',
            description: 'Material to use',
            options: [
                'minecraft:white_concrete',
                'minecraft:gray_concrete',
                'minecraft:redstone_block',
            ]
        },
    },
    outputs: {
        schematic: { type: 'object' }
    }
};

export default async function({ length, material }, { Schematic }) {
    const schem = new Schematic();

    // Build a simple redstone bus along the X axis
    for (let x = 1; x < length; x++) {
        schem.set_block(x, 0, 0, material);
        if (x % 16 === 0) {
            schem.set_block(x, 1, 0, "minecraft:repeater[facing=west,powered=false,locked=false]");
        } else {
            schem.set_block(x, 1, 0, "minecraft:redstone_wire[power=0,east=side,west=side]");
        }
    }

    return { schematic: schem };
}
`;

/** Coerce a worker-returned schematic value into bytes the renderer accepts. */
function toBytes(value: unknown): Uint8Array | null {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (value && typeof value === 'object' && 'buffer' in (value as any)) {
    try {
      return new Uint8Array((value as any).buffer);
    } catch {
      return null;
    }
  }
  return null;
}

export default function Workbench() {
  const { run, logs, clearLogs, ready } = useScriptRunner();
  const [code, setCode] = useState(DEFAULT_CODE);
  const [inputsText, setInputsText] = useState('{}');
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<Awaited<ReturnType<typeof run>> | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Seed the inputs box from the io defaults once, best-effort.
  useEffect(() => {
    setInputsText(JSON.stringify(extractIoDefaults(DEFAULT_CODE), null, 2));
  }, []);

  const handleRun = useCallback(async () => {
    setError(null);
    setResult(null);
    clearLogs();

    let inputs: Record<string, unknown> = {};
    if (inputsText.trim()) {
      try {
        inputs = JSON.parse(inputsText);
      } catch (e) {
        setError(`Invalid inputs JSON: ${(e as Error).message}`);
        return;
      }
    }

    setRunning(true);
    try {
      const res = await run(code, inputs);
      setResult(res);
      if (!res.success) setError(res.error?.message ?? 'Execution failed');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRunning(false);
    }
  }, [code, inputsText, run, clearLogs]);

  const schematics = useMemo(() => {
    const out: Array<{ key: string; bytes: Uint8Array }> = [];
    const raw = (result as any)?.schematics as Record<string, unknown> | undefined;
    if (raw) {
      for (const [key, value] of Object.entries(raw)) {
        const bytes = toBytes(value);
        if (bytes) out.push({ key, bytes });
      }
    }
    return out;
  }, [result]);

  return (
    <div className="flex h-screen flex-col bg-neutral-950 text-neutral-200">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
        <div>
          <h1 className="text-sm font-semibold">Code Block Workbench</h1>
          <p className="text-xs text-neutral-500">Run a single block as a standalone script</p>
        </div>
        <button
          onClick={handleRun}
          disabled={!ready || running}
          className="inline-flex items-center gap-2 rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          {running ? 'Running…' : ready ? 'Run' : 'Loading worker…'}
        </button>
      </header>

      {/* Body */}
      <div className="flex min-h-0 flex-1">
        {/* Editor */}
        <div className="min-w-0 flex-1 border-r border-neutral-800">
          <Editor
            height="100%"
            defaultLanguage="javascript"
            theme="vs-dark"
            value={code}
            onChange={(v) => setCode(v ?? '')}
            options={{
              minimap: { enabled: false },
              fontSize: 13,
              scrollBeyondLastLine: false,
              tabSize: 2,
            }}
          />
        </div>

        {/* Right panel */}
        <div className="flex w-[44%] max-w-[640px] min-w-[360px] flex-col overflow-y-auto">
          {/* Inputs */}
          <section className="border-b border-neutral-800 p-3">
            <label className="mb-1 block text-xs font-medium text-neutral-400">Inputs (JSON)</label>
            <textarea
              value={inputsText}
              onChange={(e) => setInputsText(e.target.value)}
              spellCheck={false}
              className="h-28 w-full resize-y rounded-md border border-neutral-800 bg-neutral-900 p-2 font-mono text-xs text-neutral-200 outline-none focus:border-neutral-600"
            />
          </section>

          {/* Error */}
          {error && (
            <section className="border-b border-neutral-800 bg-red-500/10 p-3">
              <p className="text-xs font-medium text-red-400">Error</p>
              <pre className="mt-1 overflow-x-auto whitespace-pre-wrap text-xs text-red-300">{error}</pre>
            </section>
          )}

          {/* Schematic preview */}
          {schematics.length > 0 && (
            <section className="border-b border-neutral-800 p-3">
              <p className="mb-2 text-xs font-medium text-neutral-400">
                Schematic{schematics.length > 1 ? 's' : ''}
              </p>
              <div className="space-y-3">
                {schematics.map(({ key, bytes }) => (
                  <div key={key}>
                    <p className="mb-1 text-[11px] text-neutral-500">{key}</p>
                    <div className="h-64 overflow-hidden rounded-md border border-neutral-800">
                      <SchematicRenderer schematic={bytes} />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Result JSON */}
          {result && (
            <section className="border-b border-neutral-800 p-3">
              <p className="mb-1 text-xs font-medium text-neutral-400">
                Result{result.executionTime != null ? ` · ${result.executionTime}ms` : ''}
              </p>
              <pre className="overflow-x-auto rounded-md bg-neutral-900 p-2 text-xs text-neutral-300">
                {JSON.stringify(result.result ?? {}, null, 2)}
              </pre>
            </section>
          )}

          {/* Logs */}
          {logs.length > 0 && (
            <section className="p-3">
              <p className="mb-1 text-xs font-medium text-neutral-400">Logs</p>
              <div className="space-y-1 font-mono text-xs">
                {logs.map((log, i) => (
                  <div
                    key={i}
                    className={
                      log.level === 'error'
                        ? 'text-red-400'
                        : log.level === 'warn'
                          ? 'text-amber-400'
                          : 'text-neutral-400'
                    }
                  >
                    {log.message}
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
