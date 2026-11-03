import { compileFlow, type FlowLike } from '../compile/flow-compiler.js';
import { WorkerClient } from '../worker/WorkerClient.js';
import { validateToolInputs } from './validate.js';

export interface ToolOutput { base64: string; format: string; metadata: Record<string, unknown> }

/** Host adapter over the normal Flow worker. Every conversion runs its authored graph. */
export class FlowToolClient {
  private client: WorkerClient | null = null;
  private result: unknown = null;
  private metadata: Record<string, unknown> = {};
  private format = 'schem';
  private generation = 0;
  private busy = false;
  private listeners = new Map<string, Array<(value: any) => void>>();
  constructor(private graph: FlowLike & { metadata?: { tool?: { timeout?: number } } }, private createWorker: () => Worker) {}
  on(event: string, callback: (value: any) => void) {
    this.listeners.set(event, [...(this.listeners.get(event) ?? []), callback]); return this;
  }
  private emit(event: string, value: unknown) { for (const fn of this.listeners.get(event) ?? []) fn(value); }
  async run(_id: string, input: Record<string, unknown>, files: Record<string, ArrayBuffer> = {}): Promise<ToolOutput> {
    this.retire();
    const generation = this.generation;
    const client = this.client = new WorkerClient({ worker: this.createWorker() });
    client.on('progress', (p: any) => {
      if (generation === this.generation && p.percent != null) this.emit('progress', { fraction: p.percent / 100, text: p.message });
    });
    try {
      this.busy = true;
      await client.waitForReady();
      const values = { ...input, ...Object.fromEntries(Object.entries(files).map(([name, data]) => [name, { data: new Uint8Array(data) }])) };
      const compiled = compileFlow(this.graph);
      const response = await client.executeScript(compiled.source, validateToolInputs(this.graph, values), {
        returnHandles: true, timeout: Math.min(300, this.graph.metadata?.tool?.timeout ?? 60) * 1000,
      });
      if (generation !== this.generation) throw new Error('superseded');
      if (!response.success) throw new Error((response as any).error?.message ?? 'Tool execution failed.');
      const result = response.result as any;
      this.result = result?.schematic;
      if (!this.result) throw new Error('This tool needs a schematic output named “schematic”.');
      this.metadata = result.metadata ?? {};
      this.format = input.format === 'litematic' ? 'litematic' : 'schem';
      const output = await this.exportResult(client);
      if (generation !== this.generation) throw new Error('superseded');
      this.emit('done', output);
      return output;
    } catch (error) {
      if (generation !== this.generation) throw new Error('superseded');
      throw error;
    } finally { if (generation === this.generation) this.busy = false; }
  }
  private async exportResult(client: WorkerClient): Promise<ToolOutput> {
    const response = await client.executeScript(`type Inputs = { schematic: Schematic; format: string };
      function generate(inputs: Inputs) { return { file: Blocks.export(inputs.schematic, inputs.format), metadata: Blocks.measure(inputs.schematic) }; }`,
      { schematic: this.result, format: this.format });
    const result = response.result as any;
    return { ...result.file, metadata: { ...this.metadata, ...result.metadata } };
  }
  private async transform(axis: string, degrees?: number): Promise<ToolOutput> {
    if (!['x', 'y', 'z'].includes(axis)) throw new Error('Invalid axis.');
    if (degrees !== undefined && ![0, 90, 180, 270].includes(degrees)) throw new Error('Rotation must be a quarter turn.');
    if (!this.client || !this.result) throw new Error('Run the tool first.');
    if (this.busy) throw new Error('Another request is already in progress.');
    const client = this.client, generation = this.generation;
    this.busy = true;
    try {
      const method = (degrees === undefined ? 'flipSchematic' : 'rotateSchematic') + axis.toUpperCase();
      await client.executeScript(`type Inputs = { schematic: Schematic }; function generate(inputs: Inputs) { (inputs.schematic.native ?? inputs.schematic).${method}(${degrees ?? ''}); return {}; }`, { schematic: this.result });
      const output = await this.exportResult(client);
      if (generation !== this.generation) throw new Error('superseded');
      this.emit('done', output); return output;
    } catch (error) {
      if (generation !== this.generation) throw new Error('superseded');
      throw error;
    } finally { if (generation === this.generation) this.busy = false; }
  }
  rotate(axis: string, degrees: number) { return this.transform(axis, degrees); }
  flip(axis: string) { return this.transform(axis); }
  async exportBytes(format: string) {
    if (this.busy) throw new Error('Another request is already in progress.');
    if (!this.client || !this.result) throw new Error('Run the tool first.');
    if (!['schem', 'litematic'].includes(format)) throw new Error('Unsupported output format.');
    const client = this.client, generation = this.generation;
    this.busy = true;
    this.format = format;
    try {
      const result = await this.exportResult(client);
      if (generation !== this.generation) throw new Error('superseded');
      return result;
    } catch (error) {
      if (generation !== this.generation) throw new Error('superseded');
      throw error;
    } finally { if (generation === this.generation) this.busy = false; }
  }
  private retire() { this.generation++; this.client?.destroy(); this.client = null; this.result = null; this.busy = false; }
  cancel() { this.retire(); this.emit('cancelled', null); }
  dispose() { this.retire(); this.listeners.clear(); }
}
