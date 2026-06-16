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
import { Play, Square, Loader2, Code2, LayoutPanelLeft, ChevronDown, Zap } from 'lucide-react';
import { useScriptRunner } from '../hooks/useScriptRunner';
import type { BlockContract, ExecutionResult } from '@flow/core';
import { defaultInputsForContract } from '@flow/core';
import { parseBlockSource, type ParsedBlock } from '../lib/block/parser';
import { missingRequiredInputs, missingInputsMessage } from '../lib/validateRequiredInputs';
import { contractToTypeScript } from '../lib/block/codegen';
import { EXAMPLE_BLOCKS } from '../lib/block/examples';
import InlineWidgetEditor from './blocks/InlineWidgetEditor';
import InputControl, { defaultForType } from './blocks/InputControl';
import OutputView from './blocks/OutputView';
import { findInputDeclarations } from '../lib/block/widgets';

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
  const { run, cancel, getData, logs, clearLogs, ready, progress } = useScriptRunner();

  const [source, setSource] = useState(EXAMPLE_BLOCKS[0].source);
  const [exampleId, setExampleId] = useState(EXAMPLE_BLOCKS[0].id);
  const [codeView, setCodeView] = useState(false);

  const [parsed, setParsed] = useState<ParsedBlock | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);

  const [values, setValues] = useState<Record<string, unknown>>({});
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<ExecutionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const runningRef = useRef(false);
  const pendingLiveRun = useRef(false);

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

  // Inline controls are placed under each positional input declaration. Inputs
  // that can't be located inline (object/destructure-form blocks) fall back to a
  // recursive form docked under the editor.
  const inlineNames = useMemo(() => new Set(findInputDeclarations(source).keys()), [source]);
  const formInputs = useMemo(
    () => Object.entries(contract.inputs).filter(([name]) => !inlineNames.has(name)),
    [contract, inlineNames]
  );
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
  // Note: the previous result stays mounted while a re-run is in flight, so
  // the schematic viewer swaps schematics in place instead of re-initializing.
  const handleRun = useCallback(async () => {
    if (runningRef.current) {
      pendingLiveRun.current = true;
      return;
    }
    // Inline-widget model: start from the contract defaults, override with any
    // runtime values the inline controls have set.
    const defaults = parsed?.contract ? defaultInputsForContract(parsed.contract) : {};
    const inputs = { ...defaults, ...values };
    const missing = missingRequiredInputs(parsed?.contract, inputs);
    if (missing.length) {
      setError(missingInputsMessage(missing));
      return;
    }
    setError(null);
    clearLogs();
    setRunning(true);
    runningRef.current = true;
    try {
      const res = await run(source, inputs);
      setResult(res);
      if (!res.success) setError(res.error?.message ?? 'Execution failed');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRunning(false);
      runningRef.current = false;
    }
  }, [source, parsed, values, run, clearLogs]);

  // Live mode: debounce-recompute whenever inputs or the source change.
  const handleRunRef = useRef(handleRun);
  handleRunRef.current = handleRun;
  useEffect(() => {
    if (!live || !ready) return;
    const timer = setTimeout(() => {
      handleRunRef.current();
    }, 400);
    return () => clearTimeout(timer);
  }, [values, source, live, ready]);

  // A change that arrived mid-run re-runs once the current run finishes.
  useEffect(() => {
    if (!running && pendingLiveRun.current) {
      pendingLiveRun.current = false;
      if (live) handleRunRef.current();
    }
  }, [running, live]);

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
          onClick={() => setLive((v) => !v)}
          className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs transition ${
            live
              ? 'border-amber-600 bg-amber-500/15 text-amber-300'
              : 'border-neutral-700 text-neutral-400 hover:border-neutral-500 hover:text-neutral-200'
          }`}
          title="Re-run automatically (debounced) when inputs or code change"
        >
          <Zap className="h-3.5 w-3.5" />
          Live
        </button>

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

      {/* Run progress (Progress.report from the block) */}
      {running && (
        <div className="h-0.5 w-full bg-neutral-900">
          {progress !== null ? (
            <div
              className="h-full bg-emerald-500 transition-[width] duration-200"
              style={{ width: `${Math.max(2, Math.min(100, progress))}%` }}
            />
          ) : (
            <div className="h-full w-1/3 animate-pulse bg-emerald-500/50" />
          )}
        </div>
      )}

      {parseError && (
        <div className="border-b border-amber-900/50 bg-amber-500/10 px-4 py-1.5 text-xs text-amber-400">
          Contract parse failed — the builder shows the last good contract. {parseError}
        </div>
      )}

      {/* Body: the full source with inline input sliders; values live in the code. */}
      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col border-r border-neutral-800">
          <div className="min-h-0 flex-1">
            <InlineWidgetEditor
              value={source}
              onChange={setSource}
              contract={contract}
              values={values}
              onValueChange={(name, v) => setValues((prev) => ({ ...prev, [name]: v }))}
              height="100%"
            />
          </div>

          {formInputs.length > 0 && (
            <div className="max-h-[45%] shrink-0 overflow-y-auto border-t border-neutral-800 p-3">
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">Inputs</h2>
              <div className="space-y-2.5">
                {formInputs.map(([name, type]) => (
                  <label key={name} className="block">
                    <span className="mb-1 block text-[11px] text-neutral-400">
                      {name} <span className="text-neutral-600">· {type.kind}</span>
                    </span>
                    <InputControl
                      type={type}
                      value={values[name] ?? defaultForType(type)}
                      onChange={(v) => setValues((prev) => ({ ...prev, [name]: v }))}
                    />
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Output panel */}
        <div className="flex w-[400px] flex-none flex-col overflow-y-auto">
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
