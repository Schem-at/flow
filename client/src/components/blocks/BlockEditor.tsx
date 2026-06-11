/**
 * <BlockEditor> — Monaco for the block BODY only (`generate` + helpers).
 * The contract's `type Inputs/Outputs` never appear here; they (plus the
 * ambient runtime declarations) are fed in invisibly as an extra lib so
 * `inputs.*`, `Schematic`, `Noise`, … autocomplete and typecheck.
 */

import { useEffect, useRef } from 'react';
import Editor, { type Monaco } from '@monaco-editor/react';
import { AMBIENT_DTS } from '../../lib/block/ambient';

export interface BlockEditorProps {
  /** Body source (helpers + generate) — NOT the full file. */
  value: string;
  onChange: (body: string) => void;
  /** Generated `type Inputs = …; type Outputs = …` declarations (hidden from the user). */
  contractTypes?: string;
  height?: string | number;
}

export default function BlockEditor({
  value,
  onChange,
  contractTypes = '',
  height = '100%',
}: BlockEditorProps) {
  const monacoRef = useRef<Monaco | null>(null);
  const contractLibRef = useRef<{ dispose: () => void } | null>(null);

  const setupMonaco = (monaco: Monaco) => {
    monacoRef.current = monaco;
    const ts = monaco.languages.typescript.typescriptDefaults;
    ts.setCompilerOptions({
      ...ts.getCompilerOptions(),
      allowNonTsExtensions: true,
      noEmit: true,
      allowJs: true,
      checkJs: false,
      strict: false,
    });
    ts.setDiagnosticsOptions({ noSemanticValidation: false, noSyntaxValidation: false });
    ts.addExtraLib(AMBIENT_DTS, 'file:///flow-ambient.d.ts');
    syncContractLib(monaco, contractTypes);
  };

  const syncContractLib = (monaco: Monaco, types: string) => {
    contractLibRef.current?.dispose();
    contractLibRef.current = monaco.languages.typescript.typescriptDefaults.addExtraLib(
      // Re-declared globally so the body file sees them without imports.
      `declare global {}\n${types}\n`,
      'file:///flow-contract.d.ts'
    );
  };

  useEffect(() => {
    if (monacoRef.current) syncContractLib(monacoRef.current, contractTypes);
  }, [contractTypes]);

  useEffect(() => () => contractLibRef.current?.dispose(), []);

  return (
    <Editor
      height={height}
      language="typescript"
      path="file:///block-body.ts"
      theme="vs-dark"
      value={value}
      onChange={(v) => onChange(v ?? '')}
      beforeMount={setupMonaco}
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
