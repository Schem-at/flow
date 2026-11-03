import { describe, it, expect } from 'vitest';
import { validateBlockSource } from './validateBlock';
import { DEFAULT_BLOCK_SOURCE } from './io-compat';
import { EXAMPLE_BLOCKS } from './examples';

// Bug #32: the CodePanel check only looked for the WORD `generate` anywhere in
// the body, while its message claimed a specific `generate(inputs)` signature.

const CONTRACT = `type Inputs = { size: number };
type Outputs = { result: Schematic };
`;

async function errorOf(code: string): Promise<string | null> {
  const r = await validateBlockSource(code);
  return r.status === 'invalid' ? r.error : null;
}

describe('validateBlockSource: generate entry point', () => {
  it('rejects a body that only mentions generate in a comment', async () => {
    const err = await errorOf(`${CONTRACT}// TODO: generate the thing\nfunction build(inputs: Inputs): Outputs { return { result: new Schematic() }; }\n`);
    expect(err).toMatch(/no top-level `generate` function/i);
  });

  it('rejects a body that only calls or references generate', async () => {
    const err = await errorOf(`${CONTRACT}const x = { generate: 1 };\nfunction main() { return generate; }\n`);
    expect(err).toMatch(/no top-level `generate` function/i);
  });

  it('rejects generate nested inside another function', async () => {
    const err = await errorOf(`${CONTRACT}function outer() {\n  function generate(inputs: Inputs) { return {}; }\n}\n`);
    expect(err).toMatch(/no top-level `generate` function/i);
  });

  it('rejects a generate that is not a function', async () => {
    const err = await errorOf(`${CONTRACT}const generate = 5;\n`);
    expect(err).toMatch(/`generate` must be a function/);
  });

  it('rejects two generate declarations', async () => {
    const err = await errorOf(
      `${CONTRACT}function generate(inputs: Inputs) { return {}; }\nconst generate = (inputs: Inputs) => ({});\n`
    );
    expect(err).toMatch(/declared 2 times/);
  });

  it('rejects generate() with no parameter when the block declares inputs', async () => {
    const err = await errorOf(`${CONTRACT}function generate(): Outputs { return { result: new Schematic() }; }\n`);
    expect(err).toMatch(/takes no parameter.*declares 1 input/);
  });

  it('rejects positional parameters that are untyped (they would never receive a value)', async () => {
    const err = await errorOf(`type Outputs = { r: number };\nfunction generate(a: number, b) { return { r: a + b }; }\n`);
    expect(err).toMatch(/parameter `b`.*type annotation/);
  });

  it('error messages do not claim a parameter name requirement', async () => {
    const messages = await Promise.all([
      errorOf(`${CONTRACT}// generate\n`),
      errorOf(`${CONTRACT}const generate = 5;\n`),
      errorOf(`${CONTRACT}function generate() { return {}; }\n`),
    ]);
    for (const m of messages) {
      expect(m).not.toBeNull();
      expect(m).not.toMatch(/generate\(inputs\)/);
    }
  });

  describe('accepts every supported entry form', () => {
    const ok: Record<string, string> = {
      'typed function declaration': DEFAULT_BLOCK_SOURCE,
      'any parameter name': `${CONTRACT}function generate(args: Inputs): Outputs { return { result: new Schematic() }; }\n`,
      'async function': `${CONTRACT}async function generate(inputs: Inputs): Promise<Outputs> { return { result: new Schematic() }; }\n`,
      'const arrow': `${CONTRACT}const generate = (inputs: Inputs): Outputs => ({ result: new Schematic() });\n`,
      'const function expression': `${CONTRACT}const generate = function (inputs: Inputs) { return { result: new Schematic() }; };\n`,
      'destructured object parameter': `${CONTRACT}function generate({ size }: Inputs) { return { result: new Schematic() }; }\n`,
      'positional typed parameters': `type Outputs = { r: number };\nfunction generate(a: number, b: number) { return { r: a + b }; }\n`,
      'no parameter and no inputs': `type Outputs = { r: number };\nfunction generate(): Outputs { return { r: 1 }; }\n`,
    };
    for (const [name, code] of Object.entries(ok)) {
      it(name, async () => {
        const r = await validateBlockSource(code);
        expect(r.status === 'invalid' ? r.error : 'valid').toBe('valid');
      });
    }

    for (const example of EXAMPLE_BLOCKS) {
      it(`example ${example.id}`, async () => {
        const r = await validateBlockSource(example.source);
        expect(r.status === 'invalid' ? r.error : 'valid').toBe('valid');
      });
    }
  });
});
