/**
 * Workbench — the single-block editing experience.
 *
 * Default layout shows NO raw types: the visual <ContractBuilder> defines
 * inputs/outputs, <BlockEditor> edits the body (generate + helpers),
 * <InputForm> fills values, <OutputView> renders results. The single .ts
 * source is canonical; the "Code" toggle reveals/edits it raw and round-trips
 * back into the builder (graceful on parse failure).
 *
 * All pieces are decoupled from flowStore/React-Flow so the node editor
 * mounts the same surfaces.
 */

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { Play, Square, Loader2, Code2, LayoutPanelLeft, ChevronDown } from 'lucide-react';
import { useScriptRunner } from '../hooks/useScriptRunner';
import type { BlockContract, ExecutionResult } from '@flow/core';
import { defaultInputsForContract } from '@flow/core';
import { parseBlockSource, type ParsedBlock } from '../lib/block/parser';
import { contractToTypeScript } from '../lib/block/codegen';
import { EXAMPLE_BLOCKS } from '../lib/block/examples';
import ContractBuilder from './blocks/ContractBuilder';
import BlockEditor from './blocks/BlockEditor';
import InputForm from './blocks/InputForm';
import OutputView from './blocks/OutputView';

/** Merge fresh contract defaults with values the user already set. */
function reseedValues(
  contract: BlockContract,
  previous: Record<string, unknown>
): Record<string, unknown> {
  const defaults = defaultInputsForContract(contract);
  const next: Record<string, unknown> = {};
  for (const name of Object.keys(contract.inputs)) {
    next[name] = name in previous ? previous[name] : defaults[name];
  }
  return next;
}

export default function Workbench() {
  const { run, cancel, getData, logs, clearLogs, ready } = useScriptRunner();

  const [source, setSource] = useState(EXAMPLE_BLOCKS[0].source);
  const [exampleId, setExampleId] = useState(EXAMPLE_BLOCKS[0].id);
  const [codeView, setCodeView] = useState(false);

  const [parsed, setParsed] = useState<ParsedBlock | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);

  const [values, setValues] = useState<Record<string, unknown>>({});
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<ExecutionResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // ── source → contract projection (debounced, graceful on failure) ──────
  const parseSeq = useRef(0);
  useEffect(() => {
    const seq = ++parseSeq.current;
    const timer = setTimeout(() => {
      parseBlockSource(source)
        .then((p) => {
          if (parseSeq.current !== seq) return;
          setParsed(p);
          setParseError(null);
        })
        .catch((e) => {
          if (parseSeq.current !== seq) return;
          setParseError((e as Error).message);
        });
    }, 250);
    return () => clearTimeout(timer);
  }, [source]);

  const contract = parsed?.contract ?? { inputs: {}, outputs: {} };
  const contractKey = JSON.stringify(contract);

  // Reseed input values whenever the contract shape changes.
  useEffect(() => {
    setValues((prev) => reseedValues(contract, prev));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contractKey]);

  // ── edits round-trip into the canonical source ──────────────────────────
  const handleContractChange = useCallback(
    (next: BlockContract) => {
      const body = parsed?.bodyText ?? '';
      setSource(`${contractToTypeScript(next)}\n\n${body}`.trimEnd() + '\n');
    },
    [parsed]
  );

  const handleBodyChange = useCallback(
    (body: string) => {
      // Keep the contract region verbatim — only the body changed.
      const contractText = parsed?.contractText ?? '';
      setSource(`${contractText}\n\n${body}`.trimEnd() + '\n');
    },
    [parsed]
  );

  const loadExample = useCallback((id: string) => {
    const example = EXAMPLE_BLOCKS.find((e) => e.id === id);
    if (!example) return;
    setExampleId(id);
    setSource(example.source);
    setValues({});
    setResult(null);
    setError(null);
  }, []);

  // ── run / cancel ────────────────────────────────────────────────────────
  const handleRun = useCallback(async () => {
    setError(null);
    setResult(null);
    clearLogs();
    setRunning(true);
    try {
      const res = await run(source, values);
      setResult(res);
      if (!res.success) setError(res.error?.message ?? 'Execution failed');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRunning(false);
    }
  }, [source, values, run, clearLogs]);

  const handleCancel = useCallback(async () => {
    await cancel();
    setRunning(false);
  }, [cancel]);

  const resultRecord = useMemo(() => {
    if (!result?.success) return null;
    const r = result.result;
    return r && typeof r === 'object' ? (r as Record<string, unknown>) : null;
  }, [result]);

  return (
    <div className="flex h-screen flex-col bg-neutral-950 text-neutral-200">
      {/* Header */}
      <header className="flex items-center gap-3 border-b border-neutral-800 px-4 py-2.5">
        <div className="min-w-0">
          <h1 className="text-sm font-semibold">Workbench</h1>
        </div>

        <div className="relative">
          <select
            value={exampleId}
            onChange={(e) => loadExample(e.target.value)}
            className="appearance-none rounded-md border border-neutral-800 bg-neutral-900 py-1 pl-2 pr-7 text-xs text-neutral-300 outline-none focus:border-neutral-600"
          >
            {EXAMPLE_BLOCKS.map((example) => (
              <option key={example.id} value={example.id}>
                {example.name}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2 top-1.5 h-3.5 w-3.5 text-neutral-500" />
        </div>

        <div className="flex-1" />

        <button
          onClick={() => setCodeView((v) => !v)}
          className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs transition ${
            codeView
              ? 'border-emerald-700 bg-emerald-600/15 text-emerald-300'
              : 'border-neutral-700 text-neutral-400 hover:border-neutral-500 hover:text-neutral-200'
          }`}
          title={codeView ? 'Back to visual editing' : 'Edit the full source, types included'}
        >
          {codeView ? <LayoutPanelLeft className="h-3.5 w-3.5" /> : <Code2 className="h-3.5 w-3.5" />}
          {codeView ? 'Visual' : 'Code'}
        </button>

        {running ? (
          <button
            onClick={handleCancel}
            className="inline-flex items-center gap-2 rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-red-500"
          >
            <Square className="h-3.5 w-3.5" /> Cancel
          </button>
        ) : (
          <button
            onClick={handleRun}
            disabled={!ready}
            className="inline-flex items-center gap-2 rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {ready ? <Play className="h-4 w-4" /> : <Loader2 className="h-4 w-4 animate-spin" />}
            {ready ? 'Run' : 'Loading…'}
          </button>
        )}
      </header>

      {parseError && (
        <div className="border-b border-amber-900/50 bg-amber-500/10 px-4 py-1.5 text-xs text-amber-400">
          Contract parse failed — the builder shows the last good contract. {parseError}
        </div>
      )}

      {/* Body */}
      <div className="flex min-h-0 flex-1">
        {codeView ? (
          /* Opt-in: the full canonical .ts source, types included */
          <div className="min-w-0 flex-1 border-r border-neutral-800">
            <BlockEditor value={source} onChange={setSource} contractTypes="" height="100%" />
          </div>
        ) : (
          <>
            {/* Contract builder (visual; raw types never shown) */}
            <aside className="w-80 flex-none overflow-y-auto border-r border-neutral-800 p-3">
              <ContractBuilder contract={contract} onChange={handleContractChange} />
            </aside>

            {/* Body editor */}
            <div className="min-w-0 flex-1 border-r border-neutral-800">
              <BlockEditor
                value={parsed?.bodyText ?? ''}
                onChange={handleBodyChange}
                contractTypes={parsed?.contractText ?? ''}
                height="100%"
              />
            </div>
          </>
        )}

        {/* Run panel */}
        <div className="flex w-[400px] flex-none flex-col overflow-y-auto">
          <section className="border-b border-neutral-800 p-3">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
              Inputs
            </h2>
            <InputForm contract={contract} values={values} onChange={setValues} />
          </section>

          {error && (
            <section className="border-b border-neutral-800 bg-red-500/10 p-3">
              <p className="text-xs font-medium text-red-400">Error</p>
              <pre className="mt-1 overflow-x-auto whitespace-pre-wrap text-xs text-red-300">
                {error}
              </pre>
            </section>
          )}

          <section className="border-b border-neutral-800 p-3">
            <h2 className="mb-2 flex items-baseline justify-between text-xs font-semibold uppercase tracking-wide text-neutral-500">
              Outputs
              {result?.executionTime != null && (
                <span className="font-normal normal-case text-neutral-600">
                  {result.executionTime} ms
                </span>
              )}
            </h2>
            <OutputView
              contract={contract}
              result={resultRecord}
              schematics={result?.schematics as Record<string, unknown> | undefined}
              getData={getData}
            />
          </section>

          {logs.length > 0 && (
            <section className="p-3">
              <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                Logs
              </h2>
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
