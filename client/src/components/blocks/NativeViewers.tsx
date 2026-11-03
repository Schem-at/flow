import {
    lazy,
    Suspense,
    useCallback,
    useEffect,
    useRef,
    useState,
} from "react";
import { useLocalExecutor } from "../../hooks/useLocalExecutor";
import type { ViewerProps } from "./registry";
import { SchematicViewer, JsonViewer } from "./viewers";
import { toolApi } from "../../lib/toolApi";
import {
    downloadText,
    downloadBarChartPng,
    rowsToCsv,
} from "../../lib/downloadFile";
const AnimatedScene = lazy(() => import("./AnimatedScene"));
const btn =
    "rounded border border-white/15 px-3 py-1.5 text-xs text-neutral-300 hover:bg-white/10 disabled:opacity-40";
export function downloadBytes(name: string, bytes: Uint8Array) {
    const url = URL.createObjectURL(new Blob([bytes.slice().buffer]));
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function bytesOf(value: any): Uint8Array | null {
    const data = value?.data ?? value?.base64 ?? value;
    if (data instanceof Uint8Array) return data;
    if (data instanceof ArrayBuffer) return new Uint8Array(data);
    if (typeof data === "string") {
        try {
            return Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
        } catch {
            return null;
        }
    }
    if (Array.isArray(data)) return Uint8Array.from(data);
    return null;
}
export function ChartViewer({ value }: ViewerProps) {
    const chart = value as any;
    const rows: { label: string; value: number }[] = Array.isArray(value)
        ? value
        : (chart?.rows ??
          chart?.labels?.map((label: string, i: number) => ({
              label,
              value: chart.values?.[i],
          })) ??
          []);
    const safe = rows
            .filter(
                (r) =>
                    r &&
                    typeof r.label === "string" &&
                    Number.isFinite(r.value),
            )
            .slice(0, 200),
        max = Math.max(1, ...safe.map((r) => Math.abs(r.value)));
    return (
        <div className="space-y-2">
            <div className="max-h-96 overflow-auto">
                {safe.map((r, i) => (
                    <div
                        key={i}
                        className="my-1 grid grid-cols-[8rem_1fr_4rem] items-center gap-2 text-xs"
                    >
                        <span className="truncate" title={r.label}>
                            {r.label}
                        </span>
                        <div
                            className="h-3 bg-fuchsia-500/60"
                            style={{
                                width: `${(Math.abs(r.value) / max) * 100}%`,
                            }}
                        />
                        <span>{r.value}</span>
                    </div>
                ))}
            </div>
            <button
                className={btn}
                onClick={() =>
                    downloadText(
                        "chart.csv",
                        rowsToCsv(["label", "value"], safe),
                        "text/csv",
                    )
                }
            >
                Download CSV
            </button>{" "}
            <button
                className={btn}
                onClick={() =>
                    downloadBarChartPng({
                        filename: "chart.png",
                        title: "Chart",
                        rows: safe,
                    })
                }
            >
                Download PNG
            </button>
        </div>
    );
}
export function NativeViewer(props: ViewerProps) {
    const native =
        (props.value as any)?.metadata?.nativeType ??
        (props.type.kind === "native" ? props.type.className : props.type.kind);
    if (native === "BuildAnimation" || native === "animation")
        return <AnimationViewer {...props} />;
    if (native === "TickSimulation" || native === "simulation")
        return <SimulationViewer {...props} />;
    if (native === "chart") return <ChartViewer {...props} />;
    return <JsonViewer {...props} />;
}
export function ToolOutput({
    name,
    value,
    getData,
    preferredFormat,
    active = true,
}: {
    name: string;
    value: any;
    preferredFormat?: string;
    active?: boolean;
    getData?: (id: string) => Promise<unknown>;
}) {
    const [resolved, setResolved] = useState<any>(null),
        [error, setError] = useState("");
    useEffect(() => {
        let alive = true;
        if (!value?._schematicHandle) setResolved(null);
        if (value?._schematicHandle && getData)
            getData(value._schematicHandle)
                .then((v) => {
                    if (alive) setResolved(v);
                })
                .catch((e) => {
                    if (alive) setError(String(e));
                });
        return () => {
            alive = false;
        };
    }, [value, getData]);
    const obj = resolved ?? value,
        bytes = bytesOf(obj),
        native = value?.metadata?.nativeType;
    const schematic =
        !!value?._schematicHandle ||
        ["schem", "schematic", "litematic", "nbt", "mcstructure"].includes(
            obj?.format,
        );
    if (native)
        return (
            <NativeViewer
                key={value.id}
                active={active}
                type={{ kind: "native", className: native }}
                value={value}
                getData={getData}
            />
        );
    if (
        value?.kind === "chart" ||
        (Array.isArray(value?.labels) && Array.isArray(value?.values))
    )
        return <ChartViewer type={{ kind: "chart" }} value={value} />;
    if (schematic)
        return (
            <div className="space-y-2">
                <SchematicViewer
                    type={{ kind: "schematic" }}
                    value={bytes ? { data: bytes } : value}
                    getData={getData}
                />
                {error && <p role="alert">{error}</p>}
                <SchematicActions
                    name={name}
                    bytes={bytes}
                    preferredFormat={preferredFormat}
                    active={active}
                    onPreview={setResolved}
                />
            </div>
        );
    if (bytes && (obj?.format || value instanceof Uint8Array))
        return (
            <div className="text-xs text-neutral-400">
                {bytes.byteLength.toLocaleString()} bytes{" "}
                <button
                    className={btn}
                    onClick={() =>
                        downloadBytes(
                            obj?.metadata?.name ??
                                `${name}.${obj?.format ?? "bin"}`,
                            bytes,
                        )
                    }
                >
                    Download file
                </button>
            </div>
        );
    return (
        <div className="space-y-2">
            <JsonViewer type={{ kind: "unknown" }} value={value} />
            <button
                className={btn}
                onClick={() =>
                    downloadText(
                        `${name}.${typeof value === "string" ? "txt" : "json"}`,
                        typeof value === "string"
                            ? value
                            : JSON.stringify(value, null, 2),
                    )
                }
            >
                Download {typeof value === "string" ? "text" : "JSON"}
            </button>
        </div>
    );
}
function AnimationViewer({ value, active = true }: ViewerProps) {
    const { executeScript } = useLocalExecutor();
    const [glb, setGlb] = useState<Uint8Array | null>(null),
        [busy, setBusy] = useState(false),
        [error, setError] = useState(""),
        [frame, setFrame] = useState<unknown>(null);
    const prepare = async () => {
        setBusy(true);
        setError("");
        try {
            const response = await fetch("/pack.zip");
            if (!response.ok)
                throw new Error("Could not load Minecraft resources.");
            const pack = new Uint8Array(await response.arrayBuffer());
            const result = await executeScript(
                "function generate(inputs) { const pack=Nucleation.ResourcePack.fromBytes(inputs.pack); return { glb:inputs.animation.toAnimatedGlbB64(pack,20), duration:inputs.animation.durationMs() }; }",
                { animation: value, pack },
                { timeout: 180000 },
            );
            if (!result.success) throw new Error(result.error?.message);
            const bytes = bytesOf(result.result?.glb);
            if (!bytes) throw new Error("Animation export returned no GLB.");
            setGlb(bytes);
        } catch (e) {
            setError(String(e));
        } finally {
            setBusy(false);
        }
    };
    const sample = useCallback(
        async (time: number) => {
            try {
                const r = await executeScript(
                    "function generate(inputs) { return { frame:JSON.parse(inputs.animation.frameJson(inputs.time)) }; }",
                    { animation: value, time },
                );
                setFrame(r.result?.frame);
            } catch (e) {
                setError(String(e));
            }
        },
        [executeScript, value],
    );
    return (
        <div className="space-y-3">
            {!glb && (
                <button
                    className={btn}
                    disabled={busy || !active}
                    onClick={prepare}
                >
                    {busy
                        ? "Preparing animated scene…"
                        : "Open animation player"}
                </button>
            )}
            {error && (
                <p role="alert" className="text-xs text-red-400">
                    {error}
                </p>
            )}
            {glb && (
                <>
                    <Suspense
                        fallback={
                            <p role="status">Loading animation player…</p>
                        }
                    >
                        <AnimatedScene bytes={glb} onSample={sample} />
                    </Suspense>
                    <button
                        className={btn}
                        onClick={() => downloadBytes("animation.glb", glb)}
                    >
                        Download animated GLB
                    </button>
                </>
            )}
            <details>
                <summary className="cursor-pointer text-xs text-neutral-400">
                    Native frame data
                </summary>
                <JsonViewer type={{ kind: "unknown" }} value={frame} />
            </details>
        </div>
    );
}
function SimulationViewer({ value, getData, active = true }: ViewerProps) {
    const { executeScript } = useLocalExecutor(),
        [snapshot, setSnapshot] = useState<any>(null),
        [error, setError] = useState(""),
        [playing, setPlaying] = useState(false),
        [busy, setBusy] = useState(false),
        [coords, setCoords] = useState([0, 1, 0]);
    const lock = useRef(false),
        alive = useRef(true);
    const step = useCallback(
        async (ticks: number, use = false) => {
            if (lock.current || !active) return;
            lock.current = true;
            setBusy(true);
            try {
                const r = await executeScript(
                    "function generate(inputs) { const world=inputs.world; if(inputs.use)world.useBlock(inputs.x,inputs.y,inputs.z); if(inputs.ticks)world.run(inputs.ticks); const schematic=Nucleation.Schematic.create('Simulation');world.bakeTo(schematic);return { schematic, ticks:world.tickCount(), quiescent:world.isQuiescent() }; }",
                    {
                        world: value,
                        ticks,
                        use,
                        x: coords[0],
                        y: coords[1],
                        z: coords[2],
                    },
                );
                if (alive.current) {
                    if (!r.success)
                        throw new Error(
                            r.error?.message || "Simulation failed.",
                        );
                    setSnapshot(r.result);
                    setError("");
                }
            } catch (e) {
                if (alive.current) {
                    setError(String(e));
                    setPlaying(false);
                }
            } finally {
                lock.current = false;
                if (alive.current) setBusy(false);
            }
        },
        [value, coords, executeScript, active],
    );
    useEffect(() => {
        alive.current = true;
        void step(0);
        return () => {
            alive.current = false;
        };
    }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
    useEffect(() => {
        if (!playing || !active) return;
        const timer = setInterval(() => void step(2), 100);
        return () => clearInterval(timer);
    }, [playing, step, active]);
    useEffect(() => {
        if (!active) setPlaying(false);
    }, [active]);
    return (
        <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
                <button
                    className={btn}
                    disabled={!active}
                    onClick={() => setPlaying(!playing)}
                >
                    {playing ? "Pause" : "Play at 20 ticks/s"}
                </button>
                <button
                    className={btn}
                    disabled={busy || playing || !active}
                    onClick={() => step(1)}
                >
                    Step 1 tick
                </button>
                <button
                    className={btn}
                    disabled={busy || playing || !active}
                    onClick={() => step(20)}
                >
                    Step 20 ticks
                </button>
            </div>
            <p className="text-xs text-neutral-400">
                Tick {String(snapshot?.ticks ?? "…")} ·{" "}
                {snapshot?.quiescent ? "Settled" : "Active"}. Run the tool again
                to reset.
            </p>
            <div className="flex gap-2">
                {["x", "y", "z"].map((axis, i) => (
                    <input
                        key={axis}
                        type="number"
                        aria-label={`Interact ${axis}`}
                        className="min-w-0 w-16 rounded border border-white/15 bg-neutral-950 p-2 text-xs"
                        value={coords[i]}
                        onChange={(e) =>
                            setCoords(
                                coords.map((v, j) =>
                                    i === j ? Number(e.target.value) : v,
                                ),
                            )
                        }
                    />
                ))}
                <button
                    className={btn}
                    disabled={busy || !active}
                    onClick={() => step(0, true)}
                >
                    Use block
                </button>
            </div>
            {error && (
                <p role="alert" className="text-xs text-red-400">
                    {error}
                </p>
            )}
            {snapshot?.schematic && (
                <ToolOutput
                    name="simulation"
                    value={snapshot.schematic}
                    active={active}
                    getData={getData}
                />
            )}
        </div>
    );
}

function SchematicActions({
    name,
    bytes,
    preferredFormat,
    onPreview,
    active = true,
}: {
    active?: boolean;
    name: string;
    bytes: Uint8Array | null;
    preferredFormat?: string;
    onPreview: (v: unknown) => void;
}) {
    const { executeScript } = useLocalExecutor(),
        [format, setFormat] = useState(preferredFormat || "schem"),
        [busy, setBusy] = useState(false),
        [error, setError] = useState(""),
        [share, setShare] = useState<{ code: string; url: string } | null>(
            null,
        );
    useEffect(() => {
        if (preferredFormat) setFormat(preferredFormat);
    }, [preferredFormat]);
    async function act(action: string, axis = "Y") {
        if (!bytes || busy || !active) return;
        setBusy(true);
        setError("");
        try {
            const r = await executeScript(
                `function generate(inputs) { const s=Nucleation.Schematic.fromData(Bytes.read(inputs.file)); if(inputs.action==='rotate') { if(inputs.axis==='X')s.rotateSchematicX(90);if(inputs.axis==='Y')s.rotateSchematicY(90);if(inputs.axis==='Z')s.rotateSchematicZ(90); } if(inputs.action==='flip') {if(inputs.axis==='X')s.flipSchematicX();if(inputs.axis==='Y')s.flipSchematicY();if(inputs.axis==='Z')s.flipSchematicZ();} return { file:Blocks.export(s,inputs.format) }; }`,
                { file: { data: bytes }, action, axis, format },
            );
            if (!r.success) throw new Error(r.error?.message);
            const file = r.result?.file as any,
                data = bytesOf(file);
            if (!data) throw new Error("No file was produced.");
            if (action === "download") downloadBytes(`${name}.${format}`, data);
            else if (action === "share")
                setShare(
                    await toolApi("tools/quickshares", "POST", {
                        ...file,
                        name: name.slice(0, 80),
                    }),
                );
            else onPreview({ ...file, data });
        } catch (e) {
            setError(String(e));
        } finally {
            setBusy(false);
        }
    }
    return (
        <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
                <select
                    aria-label="Schematic download format"
                    className="rounded border border-white/15 bg-neutral-950 p-2 text-xs"
                    value={format}
                    onChange={(e) => setFormat(e.target.value)}
                >
                    <option value="schem">Sponge .schem</option>
                    <option value="litematic">Litematica .litematic</option>
                </select>
                <button
                    disabled={!bytes || busy || !active}
                    className={btn}
                    onClick={() => act("download")}
                >
                    {busy ? "Working…" : "Download"}
                </button>
                <button
                    disabled={!bytes || busy || !active}
                    className={btn}
                    onClick={() => act("share")}
                >
                    Share to Minecraft
                </button>
            </div>
            <details>
                <summary className="cursor-pointer text-xs text-neutral-500">
                    Rotate or flip output
                </summary>
                <div className="mt-2 flex flex-wrap gap-2">
                    {["X", "Y", "Z"].map((axis) => (
                        <span key={axis}>
                            <button
                                className={btn}
                                disabled={!bytes || busy || !active}
                                onClick={() => act("rotate", axis)}
                            >
                                Rotate {axis} 90°
                            </button>{" "}
                            <button
                                className={btn}
                                disabled={!bytes || busy || !active}
                                onClick={() => act("flip", axis)}
                            >
                                Flip {axis}
                            </button>
                        </span>
                    ))}
                </div>
            </details>
            {error && (
                <p role="alert" className="text-xs text-red-400">
                    {error}
                </p>
            )}
            {share && (
                <p className="text-sm">
                    <a className="text-fuchsia-300" href={share.url}>
                        Open quickshare {share.code}
                    </a>
                </p>
            )}
        </div>
    );
}
