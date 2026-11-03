import { NativeViewer, ChartViewer, ToolOutput } from './NativeViewers';
/**
 * The type registry — one place per FlowType kind. Each entry wires up the
 * input widget, the output viewer, validation, and a display label at once;
 * the form/view builders simply recurse over the FlowType tree and look up
 * behaviour here. Adding a new domain type = one registerType() call.
 */

import { PaletteWidget, UsernameWidget, SetWidget, FileWidget } from './ToolWidgets';
import type { ComponentType } from 'react';
import type { FlowType, FlowTypeKind } from '@flow/core';
import { validateValue } from '@flow/core';
import {
  NumberWidget,
  StringWidget,
  BooleanWidget,
  EnumWidget,
  BlockWidget,
  SchematicWidget,
  ImageWidget,
  Vec3Widget,
  ListWidget,
  ObjectWidget,
  JsonWidget,
} from './widgets';
import {
  PrimitiveViewer,
  EnumViewer,
  SchematicViewer,
  ImageViewer,
  Vec3Viewer,
  ListViewer,
  ObjectViewer,
  JsonViewer,
} from './viewers';

export interface WidgetProps {
  ariaLabel?: string;
  type: FlowType;
  value: unknown;
  onChange: (value: unknown) => void;
}

export interface ViewerProps {
  active?: boolean;
  type: FlowType;
  value: unknown;
  /** Resolve worker data handles (e.g. resident schematics) to bytes. */
  getData?: (handleId: string) => Promise<unknown>;
}

export interface TypeEntry {
  /** Human label shown in the ContractBuilder kind picker. */
  label: string;
  inputWidget: ComponentType<WidgetProps>;
  outputViewer: ComponentType<ViewerProps>;
  /** Returns an error message, or null when valid. */
  validate: (type: FlowType, value: unknown) => string | null;
}

const registry = new Map<FlowTypeKind, TypeEntry>();

export function registerType(kind: FlowTypeKind, entry: TypeEntry): void {
  registry.set(kind, entry);
}

export function getTypeEntry(kind: FlowTypeKind): TypeEntry {
  return registry.get(kind) ?? registry.get('unknown')!;
}

/** Kinds offered in the ContractBuilder, in menu order. */
export function listKinds(): Array<{ kind: FlowTypeKind; label: string }> {
  return [...registry.entries()].map(([kind, entry]) => ({ kind, label: entry.label }));
}

const structural = (type: FlowType, value: unknown) => validateValue(type, value);

registerType('number', {
  label: 'Number',
  inputWidget: NumberWidget,
  outputViewer: PrimitiveViewer,
  validate: structural,
});

registerType('string', {
  label: 'Text',
  inputWidget: StringWidget,
  outputViewer: PrimitiveViewer,
  validate: structural,
});

registerType('boolean', {
  label: 'Toggle',
  inputWidget: BooleanWidget,
  outputViewer: PrimitiveViewer,
  validate: structural,
});

registerType('enum', {
  label: 'Choice',
  inputWidget: EnumWidget,
  outputViewer: EnumViewer,
  validate: structural,
});

registerType('block', {
  label: 'Minecraft block',
  inputWidget: BlockWidget,
  outputViewer: PrimitiveViewer,
  validate: structural,
});

registerType('schematic', {
  label: 'Schematic',
  inputWidget: SchematicWidget,
  outputViewer: SchematicViewer,
  validate: structural,
});

registerType('image', {
  label: 'Image',
  inputWidget: ImageWidget,
  outputViewer: ImageViewer,
  validate: structural,
});

registerType('vec3', {
  label: 'Vector (x,y,z)',
  inputWidget: Vec3Widget,
  outputViewer: Vec3Viewer,
  validate: structural,
});

registerType('list', {
  label: 'List',
  inputWidget: ListWidget,
  outputViewer: ListViewer,
  validate: structural,
});

registerType('object', {
  label: 'Group',
  inputWidget: ObjectWidget,
  outputViewer: ObjectViewer,
  validate: structural,
});

registerType('unknown', {
  label: 'JSON',
  inputWidget: JsonWidget,
  outputViewer: JsonViewer,
  validate: () => null,
});

for (const [kind, label, inputWidget] of [['palette', 'Block palette', PaletteWidget], ['username', 'Minecraft username', UsernameWidget], ['set', 'Multiple choices', SetWidget], ['file', 'File', FileWidget]] as const) registerType(kind, { label, inputWidget, outputViewer: kind === 'file' ? ((props: ViewerProps) => <ToolOutput name="output" value={props.value} getData={props.getData}/>) : JsonViewer, validate: structural });
for (const kind of ['native','animation','simulation','chart'] as const) registerType(kind, { label: kind, inputWidget: JsonWidget, outputViewer: kind === 'chart' ? ChartViewer : NativeViewer, validate: structural });
