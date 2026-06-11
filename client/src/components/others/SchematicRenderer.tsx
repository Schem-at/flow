import { SchematicRenderer as Renderer } from 'schematic-renderer';
import { useRef, useState, useEffect, useCallback } from 'react';
import { Download } from 'lucide-react';
import { getSharedRendererContext } from '../../lib/schematicRendererContext';

/**
 * SchematicRenderer component - renders schematic binary data (Uint8Array/ArrayBuffer).
 *
 * All instances share one SchematicRendererContext (assets, worker pool, WebGL
 * context — render-and-blit). The per-mount Renderer is a cheap viewport that
 * is created ONCE; subsequent `schematic` prop changes swap the loaded
 * schematic in place instead of re-initializing packs/atlas.
 */
const SchematicRenderer = ({ schematic }: { schematic: Uint8Array | ArrayBuffer }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const rendererRef = useRef<Renderer | null>(null);
    const readyRef = useRef<Promise<Renderer> | null>(null);
    const hasFramedRef = useRef(false);
    const loadSeqRef = useRef(0);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;

        const handleEvent = (e: Event) => {
            // Prevents the browser zoom/scroll
            e.preventDefault();
            // Stops the event from bubbling up to parents
            e.stopPropagation();
        };

        // Option required to allow preventDefault to work
        const options = { passive: false };

        // Standard events
        el.addEventListener("wheel", handleEvent, options);
        el.addEventListener("touchstart", handleEvent, options);

        // Safari/WebKit Gesture events (Pinch to zoom)
        el.addEventListener("gesturestart", handleEvent, options);
        el.addEventListener("gesturechange", handleEvent, options);
        el.addEventListener("gestureend", handleEvent, options);

        return () => {
            el.removeEventListener("wheel", handleEvent);
            el.removeEventListener("touchstart", handleEvent);
            el.removeEventListener("gesturestart", handleEvent);
            el.removeEventListener("gesturechange", handleEvent);
            el.removeEventListener("gestureend", handleEvent);
        };
    }, []);

    // Download function
    const handleDownload = useCallback(() => {
        if (!schematic) return;

        try {
            // Convert to blob - create a copy to ensure we have a proper ArrayBuffer
            const bytes = schematic instanceof Uint8Array
                ? schematic
                : new Uint8Array(schematic);
            const blob = new Blob([new Uint8Array(bytes)], {
                type: 'application/octet-stream'
            });

            // Create download link
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `schematic_${Date.now()}.schem`;
            document.body.appendChild(link);
            link.click();

            // Cleanup
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        } catch (err) {
            console.error('Failed to download schematic:', err);
        }
    }, [schematic]);

    /** Coerce worker/cross-realm values into a standalone ArrayBuffer. */
    const toArrayBuffer = (value: Uint8Array | ArrayBuffer): ArrayBuffer | null => {
        if (value instanceof Uint8Array) return value.slice().buffer;
        if (value instanceof ArrayBuffer) return value;
        if (ArrayBuffer.isView(value)) {
            const view = value as Uint8Array;
            const buf = view.buffer as ArrayBuffer;
            return buf.slice(view.byteOffset, view.byteOffset + view.byteLength);
        }
        if (value && typeof value === 'object' && 'byteLength' in (value as object)) {
            // Cross-realm typed array — instanceof fails across worker boundaries
            const arr = value as unknown as { buffer?: ArrayBuffer; byteLength: number; byteOffset?: number; [index: number]: number };
            if (arr.buffer) {
                return arr.buffer.slice(arr.byteOffset || 0, (arr.byteOffset || 0) + arr.byteLength);
            }
            const temp = new Uint8Array(arr.byteLength);
            for (let i = 0; i < arr.byteLength; i++) temp[i] = arr[i];
            return temp.buffer;
        }
        return null;
    };

    // Create the viewport renderer ONCE per mount, on the shared context.
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        let cancelled = false;

        readyRef.current = (async () => {
            const context = await getSharedRendererContext();
            if (cancelled) throw new Error('cancelled');

            let resolveInit!: () => void;
            const initialized = new Promise<void>((res) => (resolveInit = res));
            const renderer = new Renderer(canvas, {}, /* packs come from the context */ {}, {
                context,
                singleSchematicMode: true,
                backgroundColor: '#1a1a1a',
                showCameraPathVisualization: false,
                enableInteraction: true,
                enableDragAndDrop: false,
                showGrid: true,
                callbacks: {
                    onRendererInitialized: () => resolveInit(),
                },
            });
            await initialized;
            if (cancelled) {
                try { renderer.dispose(); } catch { /* ignore */ }
                throw new Error('cancelled');
            }
            rendererRef.current = renderer;
            return renderer;
        })();
        readyRef.current.catch(() => { /* handled per-load */ });

        return () => {
            cancelled = true;
            readyRef.current = null;
            hasFramedRef.current = false;
            const renderer = rendererRef.current;
            rendererRef.current = null;
            if (renderer) {
                try { renderer.dispose(); } catch { /* ignore */ }
            }
        };
    }, []);

    // Swap the schematic whenever the data changes — no renderer re-init.
    useEffect(() => {
        if (!schematic) return;
        const seq = ++loadSeqRef.current;

        (async () => {
            const ready = readyRef.current;
            if (!ready) return;
            setIsLoading(true);
            setError(null);
            try {
                const renderer = await ready;
                if (seq !== loadSeqRef.current) return; // newer data superseded this load

                const data = toArrayBuffer(schematic);
                if (!data) {
                    setError('Invalid schematic format');
                    return;
                }

                await renderer.schematicManager?.removeAllSchematics?.();
                await renderer.schematicManager?.loadSchematic('viewed-schematic', data);
                if (seq !== loadSeqRef.current) return;

                // Frame the first load; afterwards keep the user's camera so
                // re-runs don't yank the view around.
                if (!hasFramedRef.current) {
                    hasFramedRef.current = true;
                    await renderer.cameraManager?.focusOnSchematics?.({
                        animationDuration: 0,
                        useTightBounds: true,
                        preserveCamera: false,
                    });
                }
            } catch (err) {
                if ((err as Error).message !== 'cancelled' && seq === loadSeqRef.current) {
                    console.error('❌ Failed to load schematic:', err);
                    setError('Failed to load schematic');
                }
            } finally {
                if (seq === loadSeqRef.current) setIsLoading(false);
            }
        })();
    }, [schematic]);

    const handleResize = useCallback(() => {
        rendererRef.current?.renderManager?.updateCanvasSize();
    }, []);

    useEffect(() => {
        const resizeObserver = new ResizeObserver(handleResize);
        const parentEl = canvasRef.current?.parentElement;
        if (parentEl) {
            resizeObserver.observe(parentEl);
        }
        return () => resizeObserver.disconnect();
    }, [handleResize]);

    if (error) {
        return <div className="flex items-center justify-center h-full text-red-400 text-xs">Error: {error}</div>;
    }

    return (
        <div
      ref={ref}
      className="relative w-full h-full nodrag nopan"
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onScroll={(e) => e.stopPropagation()}
    >
            {isLoading && (
                <div className="absolute inset-0 flex items-center justify-center bg-neutral-900/80 z-10">
                    <span className="text-neutral-400 text-xs">Loading...</span>
                </div>
            )}
            <canvas
                ref={canvasRef}
                style={{ width: '100%', height: '100%' }}
            />
            <button
                onClick={handleDownload}
                className="absolute bottom-2 right-2 p-2 bg-neutral-800/80 hover:bg-neutral-700/80 text-neutral-300 rounded backdrop-blur-sm transition-colors z-20"
                title="Download schematic"
            >
                <Download className="w-4 h-4" />
            </button>
        </div>
    );
}

export default SchematicRenderer;
