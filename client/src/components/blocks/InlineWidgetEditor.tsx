/**
 * <InlineWidgetEditor> — Monaco over the FULL block source, with a recursive
 * React input control rendered INLINE under each input declaration. Scalars get
 * a slider/field; arrays get an array editor; objects nest — all of it floating
 * in a Monaco view zone whose height tracks the form (a ResizeObserver keeps the
 * reserved gap in sync as arrays grow/shrink).
 *
 * Controls drive RUNTIME values (onValueChange); they never rewrite the source.
 * Each control is a *content widget* (the overlay layer that receives mouse
 * events) inside a view zone (which reserves the vertical space).
 */

import { createElement, useEffect, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import Editor, { type Monaco } from '@monaco-editor/react';
import type { editor as MonacoEditor, IDisposable } from 'monaco-editor';
import type { BlockContract, FlowType } from '@flow/core';
import { setupAmbientMonaco } from '../../lib/block/ambient';
import { findInputDeclarations } from '../../lib/block/widgets';
import InputControl, { defaultForType } from './InputControl';

export interface InlineWidgetEditorProps {
  value: string;
  onChange: (next: string) => void;
  contract: BlockContract;
  values: Record<string, unknown>;
  onValueChange: (name: string, value: unknown) => void;
  height?: string | number;
}

interface InlineControl {
  type: FlowType;
  container: HTMLElement;
  root: Root;
  zone: MonacoEditor.IViewZone;
  zoneId: string;
  widget: MonacoEditor.IContentWidget;
  observer: ResizeObserver;
}

export default function InlineWidgetEditor({
  value,
  onChange,
  contract,
  values,
  onValueChange,
  height = '100%',
}: InlineWidgetEditorProps) {
  const editorRef = useRef<MonacoEditor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<Monaco | null>(null);
  const controlsRef = useRef<Map<string, InlineControl>>(new Map());
  const signatureRef = useRef<string>('');
  const changeSubRef = useRef<IDisposable | null>(null);

  // Latest props readable from imperative callbacks without re-binding.
  const contractRef = useRef(contract); contractRef.current = contract;
  const valuesRef = useRef(values); valuesRef.current = values;
  const onValueChangeRef = useRef(onValueChange); onValueChangeRef.current = onValueChange;

  const renderInto = (name: string, ctl: InlineControl) => {
    const v = valuesRef.current[name] ?? defaultForType(ctl.type);
    ctl.root.render(
      createElement(InputControl, {
        type: ctl.type,
        value: v,
        onChange: (next: unknown) => onValueChangeRef.current(name, next),
      })
    );
  };

  const teardown = () => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.changeViewZones((acc) => {
      for (const ctl of controlsRef.current.values()) acc.removeZone(ctl.zoneId);
    });
    for (const ctl of controlsRef.current.values()) {
      ctl.observer.disconnect();
      editor.removeContentWidget(ctl.widget);
      ctl.root.unmount();
    }
    controlsRef.current.clear();
  };

  const sync = () => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!editor || !monaco) return;
    const model = editor.getModel();
    if (!model) return;

    const positions = findInputDeclarations(model.getValue());
    const inputs = [...positions.entries()]
      .filter(([name]) => contractRef.current.inputs[name])
      .map(([name, offset]) => ({ name, offset, line: model.getPositionAt(offset).lineNumber }));

    // Structural signature: which inputs, on which lines. Rebuild only when that
    // changes; otherwise just re-render the existing controls with fresh values.
    const signature = inputs.map((i) => `${i.name}@${i.line}`).join('|');
    if (signature === signatureRef.current) {
      for (const { name } of inputs) {
        const ctl = controlsRef.current.get(name);
        if (ctl) { ctl.type = contractRef.current.inputs[name]; renderInto(name, ctl); }
      }
      return;
    }
    signatureRef.current = signature;
    teardown();

    editor.changeViewZones((acc) => {
      for (const { name, line } of inputs) {
        const type = contractRef.current.inputs[name];
        const container = document.createElement('div');
        container.style.cssText = 'padding:2px 0 6px 2ch;pointer-events:auto';
        for (const ev of ['pointerdown', 'mousedown', 'click', 'keydown']) {
          container.addEventListener(ev, (e) => e.stopPropagation());
        }
        const root = createRoot(container);

        const zone: MonacoEditor.IViewZone = {
          afterLineNumber: line,
          heightInPx: 26,
          domNode: document.createElement('div'),
        };
        const zoneId = acc.addZone(zone);

        const widget: MonacoEditor.IContentWidget = {
          getId: () => `inline-input:${name}`,
          getDomNode: () => container,
          getPosition: () => ({
            position: { lineNumber: line, column: 1 },
            preference: [monaco.editor.ContentWidgetPositionPreference.BELOW],
          }),
        };
        editor.addContentWidget(widget);

        // Keep the reserved gap as tall as the rendered form.
        const observer = new ResizeObserver(() => {
          const h = container.offsetHeight + 4;
          if (Math.abs((zone.heightInPx ?? 0) - h) > 1) {
            zone.heightInPx = h;
            editor.changeViewZones((a) => a.layoutZone(zoneId));
            editor.layoutContentWidget(widget);
          }
        });
        observer.observe(container);

        const ctl: InlineControl = { type, container, root, zone, zoneId, widget, observer };
        controlsRef.current.set(name, ctl);
        renderInto(name, ctl);
      }
    });
  };

  // Re-render controls when external values or the contract (types) change.
  useEffect(() => { sync(); }, [values, contract]);

  const handleMount = (editor: MonacoEditor.IStandaloneCodeEditor, monaco: Monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    changeSubRef.current = editor.onDidChangeModelContent(() => sync());
    sync();
  };

  useEffect(() => () => { changeSubRef.current?.dispose(); teardown(); }, []);

  return (
    <Editor
      height={height}
      language="typescript"
      path="file:///block-source.ts"
      theme="vs-dark"
      value={value}
      onChange={(v) => onChange(v ?? '')}
      beforeMount={(monaco) => setupAmbientMonaco(monaco)}
      onMount={handleMount}
      options={{
        minimap: { enabled: false },
        fontSize: 13,
        scrollBeyondLastLine: false,
        tabSize: 2,
        automaticLayout: true,
      }}
    />
  );
}
