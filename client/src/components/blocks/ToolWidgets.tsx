import { useId, useEffect, useMemo, useState, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { DEFAULT_PALETTE, bytesToBase64, detectFormatFromExtension, type PaletteChoice } from "@flow/core";
import type { WidgetProps } from "./registry";

const field =
    "w-full rounded border border-white/15 bg-neutral-950 px-2 py-1.5 text-xs text-neutral-200";
const button =
    "rounded border border-white/15 px-3 py-1.5 text-xs hover:bg-white/10 disabled:opacity-40";
interface Block {
    id: string;
    name: string;
    color: number[];
    kind: string;
    tags: string[];
}
async function readJson(url: string) {
    const res = await fetch(url, {
        credentials: "include",
        headers: { Accept: "application/json" },
    });
    if (!res.ok) throw new Error("Could not load block data. Try again.");
    return res.json();
}
function normalize(value: unknown): PaletteChoice {
    const p =
        value && typeof value === "object"
            ? (value as Partial<PaletteChoice>)
            : {};
    return {
        ...DEFAULT_PALETTE,
        ...p,
        include: p.include ?? [],
        exclude: p.exclude ?? [],
        replace: p.replace && !Array.isArray(p.replace) ? p.replace : {},
    };
}

export function PaletteWidget({ value, onChange }: WidgetProps) {
    const choice = normalize(value);
    const blockListId = useId();
    const [open, setOpen] = useState(false),
        [query, setQuery] = useState(""),
        [onlySelected, setOnlySelected] = useState(false);
    const [kind, setKind] = useState(""),
        [name, setName] = useState(""),
        [notice, setNotice] = useState("");
    const [saved, setSaved] = useState<Record<string, PaletteChoice>>(() => {
        try {
            return JSON.parse(
                localStorage.getItem("schemati.tool-palettes.v1") ?? "{}",
            );
        } catch {
            return {};
        }
    });
    const catalogue = useQuery<{ blocks: Block[]; kinds: string[] }>({
        queryKey: ["tool-blocks"],
        queryFn: () => readJson("/api/tools/blocks"),
        staleTime: 86400000,
        enabled: open,
    });
    const preset = useQuery<{ ids: string[] }>({
        queryKey: ["tool-preset", choice.preset],
        queryFn: () =>
            readJson(`/api/tools/presets/${encodeURIComponent(choice.preset)}`),
        staleTime: 86400000,
        enabled: open && choice.preset !== "custom",
    });
    const selected = useMemo(
        () =>
            new Set(
                [
                    ...(choice.preset === "custom"
                        ? []
                        : (preset.data?.ids ?? [])),
                    ...choice.include,
                ].filter((id) => !choice.exclude.includes(id)),
            ),
        [choice.preset, choice.include, choice.exclude, preset.data],
    );
    const filtered = useMemo(
        () =>
            (catalogue.data?.blocks ?? []).filter(
                (b) =>
                    (!kind || b.kind === kind) &&
                    (!onlySelected || selected.has(b.id)) &&
                    `${b.id} ${b.name} ${(b.tags ?? []).join(" ")}`
                        .toLowerCase()
                        .includes(query.toLowerCase()),
            ),
        [catalogue.data, query, kind, onlySelected, selected],
    );
    function toggle(ids: string[], enabled: boolean) {
        const include = new Set(choice.include),
            exclude = new Set(choice.exclude);
        for (const id of ids) {
            if (enabled) {
                include.add(id);
                exclude.delete(id);
            } else {
                include.delete(id);
                exclude.add(id);
            }
        }
        onChange({ ...choice, include: [...include], exclude: [...exclude] });
    }
    function persist(next: Record<string, PaletteChoice>) {
        try {
            localStorage.setItem(
                "schemati.tool-palettes.v1",
                JSON.stringify(next),
            );
            setSaved(next);
            setNotice("Saved in this browser.");
        } catch {
            setNotice("Browser storage is full or unavailable.");
        }
    }
    return (
        <div className="nodrag nopan space-y-3 text-neutral-300">
            <div className="flex gap-2">
                <select
                    aria-label="Palette preset"
                    className={field}
                    value={choice.preset}
                    onChange={(e) =>
                        onChange({
                            ...choice,
                            preset: e.target.value,
                            include: [],
                            exclude: [],
                        })
                    }
                >
                    {Object.entries({
                        solid: "Solid blocks",
                        materials: "Solid + glass",
                        survival: "Survival",
                        concrete: "Concrete",
                        wool: "Wool",
                        terracotta: "Terracotta",
                        wood: "Wood",
                        grayscale: "Grayscale",
                        custom: "Custom selection",
                    }).map(([id, label]) => (
                        <option key={id} value={id}>
                            {label}
                        </option>
                    ))}
                </select>
                <button
                    type="button"
                    className={button}
                    onClick={() => setOpen(!open)}
                >
                    {open ? "Close editor" : "Edit palette"}
                </button>
            </div>
            <p className="text-xs text-neutral-500">
                {choice.include.length} added · {choice.exclude.length} excluded
                · {Object.keys(choice.replace).length} replacements
            </p>
            {open && (
                <div className="space-y-3 rounded border border-white/10 p-3">
                    <input
                        aria-label="Search blocks"
                        placeholder="Search blocks, colours, or materials…"
                        className={field}
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                    />
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                        <select
                            aria-label="Block kind"
                            className={button}
                            value={kind}
                            onChange={(e) => setKind(e.target.value)}
                        >
                            <option value="">All kinds</option>
                            {catalogue.data?.kinds?.map((k) => (
                                <option key={k} value={k}>{k.replace(/^minecraft:/, "").replace(/_/g, " ")}</option>
                            ))}
                        </select>
                        <label>
                            <input
                                type="checkbox"
                                checked={onlySelected}
                                onChange={(e) =>
                                    setOnlySelected(e.target.checked)
                                }
                            />{" "}
                            Selected only ({selected.size})
                        </label>
                    </div>
                    {(catalogue.isLoading || preset.isLoading) && (
                        <p role="status">Loading blocks…</p>
                    )}
                    {(catalogue.error || preset.error) && (
                        <p role="alert" className="text-red-400">
                            {String(catalogue.error ?? preset.error)}
                        </p>
                    )}
                    <div className="flex flex-wrap gap-2">
                        <button
                            type="button"
                            className={button}
                            disabled={!catalogue.data || preset.isLoading}
                            onClick={() =>
                                toggle(
                                    filtered.map((b) => b.id),
                                    true,
                                )
                            }
                        >
                            Include filtered ({filtered.length})
                        </button>
                        <button
                            type="button"
                            className={button}
                            disabled={!catalogue.data || preset.isLoading}
                            onClick={() =>
                                toggle(
                                    filtered.map((b) => b.id),
                                    false,
                                )
                            }
                        >
                            Exclude filtered
                        </button>
                        <button
                            type="button"
                            className={button}
                            onClick={() =>
                                onChange({
                                    ...choice,
                                    include: [],
                                    exclude: [],
                                    replace: {},
                                })
                            }
                        >
                            Reset changes
                        </button>
                    </div>
                    <div className="grid max-h-64 grid-cols-2 gap-1 overflow-auto sm:grid-cols-3">
                        {filtered.slice(0, 180).map((b) => (
                            <button
                                type="button"
                                key={b.id}
                                aria-pressed={selected.has(b.id)}
                                title={b.id}
                                disabled={preset.isLoading}
                                onClick={() =>
                                    toggle([b.id], !selected.has(b.id))
                                }
                                className={`flex items-center gap-2 rounded border p-2 text-left text-xs ${selected.has(b.id) ? "border-fuchsia-500/60 bg-fuchsia-500/10" : "border-white/10 opacity-60"}`}
                            >
                                <span
                                    className="h-5 w-5 shrink-0 rounded-sm border border-white/15"
                                    style={{
                                        background: `rgb(${b.color?.join(",") ?? "120,120,120"})`,
                                    }}
                                />
                                {b.name}
                            </button>
                        ))}
                    </div>
                    {filtered.length > 180 && (
                        <p className="text-xs">
                            Showing 180 of {filtered.length}. Narrow the search,
                            or apply a bulk selection to all matches.
                        </p>
                    )}
                    <details>
                        <summary className="cursor-pointer text-sm">
                            Block replacements (
                            {Object.keys(choice.replace).length})
                        </summary>
                        <p className="my-2 text-xs text-neutral-500">
                            Swap a matched block after conversion. Search by
                            block name below.
                        </p>
                        {Object.entries(choice.replace).map(([from, to]) => (
                            <div
                                key={from}
                                className="my-2 flex items-center gap-2 text-xs"
                            >
                                <span
                                    className="min-w-0 flex-1 truncate"
                                    title={from}
                                >
                                    {from.replace("minecraft:", "")}
                                </span>
                                <span>→</span>
                                <input
                                    aria-label={`Replace ${from} with`}
                                    list={blockListId}
                                    className={field}
                                    value={to}
                                    onChange={(e) =>
                                        onChange({
                                            ...choice,
                                            replace: {
                                                ...choice.replace,
                                                [from]: e.target.value,
                                            },
                                        })
                                    }
                                />
                                <button
                                    type="button"
                                    className={button}
                                    onClick={() => {
                                        const next = { ...choice.replace };
                                        delete next[from];
                                        onChange({ ...choice, replace: next });
                                    }}
                                >
                                    Remove
                                </button>
                            </div>
                        ))}
                        <select
                            aria-label="Add replacement"
                            className={field}
                            value=""
                            onChange={(e) => {
                                if (e.target.value)
                                    onChange({
                                        ...choice,
                                        replace: {
                                            ...choice.replace,
                                            [e.target.value]: e.target.value,
                                        },
                                    });
                            }}
                        >
                            <option value="">Choose a source block…</option>
                            {filtered.map((b) => (
                                <option key={b.id} value={b.id}>
                                    {b.name}
                                </option>
                            ))}
                        </select>
                        <datalist id={blockListId}>
                            {catalogue.data?.blocks.map((b) => (
                                <option key={b.id} value={b.id}>
                                    {b.name}
                                </option>
                            ))}
                        </datalist>
                    </details>
                    <details>
                        <summary className="cursor-pointer text-sm">
                            Saved palettes
                        </summary>
                        <div className="my-2 flex gap-2">
                            <input
                                aria-label="Palette name"
                                placeholder="Palette name"
                                className={field}
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                            />
                            <button
                                type="button"
                                className={button}
                                disabled={!name.trim() || !!saved[name.trim()]}
                                onClick={() =>
                                    persist({ ...saved, [name.trim()]: choice })
                                }
                            >
                                Save new
                            </button>
                        </div>
                        {Object.entries(saved).map(([key, p]) => (
                            <div
                                key={key}
                                className="flex items-center gap-2 py-1"
                            >
                                <button
                                    type="button"
                                    className="flex-1 text-left text-xs hover:text-fuchsia-300"
                                    onClick={() => onChange(p)}
                                >
                                    {key}
                                </button>
                                <button
                                    type="button"
                                    className={button}
                                    onClick={() => {
                                        const next = { ...saved };
                                        delete next[key];
                                        persist(next);
                                    }}
                                >
                                    Delete
                                </button>
                            </div>
                        ))}
                        {notice && (
                            <p role="status" className="text-xs">
                                {notice}
                            </p>
                        )}
                    </details>
                </div>
            )}
        </div>
    );
}

export function UsernameWidget({ value, onChange, ariaLabel }: WidgetProps) {
    const text = String(value ?? ""),
        [status, setStatus] = useState("");
    useEffect(() => {
        setStatus("");
        if (!/^[A-Za-z0-9_]{1,16}$/.test(text)) return;
        const controller = new AbortController();
        const timer = setTimeout(() => {
            fetch(`/api/tools/assets/skins/${encodeURIComponent(text)}`, {
                signal: controller.signal,
            })
                .then(async (r) => {
                    if (!r.ok) throw new Error("Player not found");
                    return r.json();
                })
                .then((p) =>
                    setStatus(
                        `${p.name} · ${p.slim ? "Slim" : "Classic"} skin`,
                    ),
                )
                .catch((e) => {
                    if (e.name !== "AbortError") setStatus(e.message);
                });
        }, 600);
        return () => {
            clearTimeout(timer);
            controller.abort();
        };
    }, [text]);
    return (
        <div>
            <input
                aria-label={ariaLabel || "Minecraft username"}
                className={field}
                value={text}
                maxLength={16}
                pattern="[A-Za-z0-9_]{1,16}"
                placeholder="Minecraft username"
                onChange={(e) => onChange(e.target.value)}
            />
            {status && (
                <p className="mt-1 text-xs text-neutral-400" role="status">
                    {status}
                </p>
            )}
        </div>
    );
}
export function SetWidget({ type, value, onChange }: WidgetProps) {
    if (type.kind !== "set") return null;
    const selected = Array.isArray(value) ? value : [];
    return (
        <div className="flex flex-wrap gap-2">
            {type.options.map((v) => (
                <button
                    type="button"
                    key={v}
                    aria-pressed={selected.includes(v)}
                    className={`${button} ${selected.includes(v) ? "border-fuchsia-500 bg-fuchsia-500/15" : ""}`}
                    onClick={() =>
                        onChange(
                            selected.includes(v)
                                ? selected.filter((x) => x !== v)
                                : [...selected, v],
                        )
                    }
                >
                    {type.labels?.[v] ?? v}
                </button>
            ))}
        </div>
    );
}
export function FileWidget({ type, value, onChange, ariaLabel }: WidgetProps) {
    const [error, setError] = useState("");
    const revision = useRef(0);
    const id = useId();
    if (type.kind !== "file") return null;
    const accept = type.accept?.map(v => v.includes("/") || v.startsWith(".") ? v : `.${v}`).join(",");
    const filename = value instanceof File ? value.name : (value as any)?.metadata?.name;
    const choose = async (file?: File) => {
        if (!file) return;
        const current = ++revision.current;
        if (type.maxBytes && file.size > type.maxBytes) { setError(`File exceeds ${Math.round(type.maxBytes / 1048576)} MB`); return; }
        if (type.accept?.length && !type.accept.some(a => a.includes('/') ? a.endsWith('/*') ? file.type.startsWith(a.slice(0,-1)) : file.type === a : file.name.toLowerCase().endsWith('.' + a.replace(/^\./, '').toLowerCase()))) {
            setError('Unsupported file format. Choose ' + accept + '.'); return;
        }
        setError("");
        try {
            const bytes = new Uint8Array(await file.arrayBuffer());
            if (current !== revision.current) return;
            onChange({ base64: bytesToBase64(bytes), format: detectFormatFromExtension(file.name), metadata: { name: file.name, fileSize: file.size, mimeType: file.type } });
        } catch (error) { if (current === revision.current) setError(error instanceof Error ? error.message : 'Could not read this file.'); }
    };
    return <div>
      <label htmlFor={id} className="relative flex cursor-pointer flex-col items-center gap-2 border border-dashed border-white/20 bg-white/[.02] px-4 py-6 text-center transition-colors hover:border-white/40 focus-within:outline focus-within:outline-brand-400"
        onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); if (!e.currentTarget.closest('fieldset[disabled]')) choose(e.dataTransfer.files[0]); }}>
        <span className="text-sm text-neutral-200">{filename || 'Drop a file here'}</span>
        <span className="text-xs text-neutral-500">{filename ? 'Choose a different file' : 'or click to browse'}</span>
        <span className="text-[10px] text-neutral-600">{accept || 'Any file'}{type.maxBytes ? ` · Up to ${Math.round(type.maxBytes / 1048576)} MB` : ''}</span>
        <input id={id} aria-label={ariaLabel || 'Input file'} className="sr-only" type="file" accept={accept} onChange={e => { choose(e.target.files?.[0]); e.target.value = ''; }}/>
      </label>
      {filename && <button type="button" className="mt-2 text-xs text-neutral-500 hover:text-white" onClick={() => { revision.current++; setError(''); onChange(null); }}>Remove file</button>}
      {error && <p role="alert" className="mt-2 text-xs text-red-400">{error}</p>}
    </div>;
}
