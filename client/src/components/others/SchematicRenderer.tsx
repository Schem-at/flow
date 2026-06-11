import { SchematicRenderer as Renderer } from 'schematic-renderer';
import { useRef, useState, useEffect, useCallback } from 'react';
import { Download } from 'lucide-react';

/**
 * SchematicRenderer component - renders schematic binary data (Uint8Array/ArrayBuffer)
 * Expects binary .schem format data, not WASM objects.
 */
const SchematicRenderer = ({ schematic }: { schematic: Uint8Array | ArrayBuffer }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const rendererRef = useRef<Renderer | null>(null);
    const [isInitialized, setIsInitialized] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    // @ts-ignore
    const lastLoadedDataRef = useRef<string | null>(null);
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

    const initializeRenderer = useCallback(async () => {
        if (!canvasRef.current) return;
        if (isInitialized) return;

        try {
            setIsLoading(true);
            setError(null);

            const renderer = new Renderer(canvasRef.current, {}, {
                vanillaPack: async () => {
                    const response = await fetch("/pack.zip");
                    const buffer = await response.arrayBuffer();
                    return new Blob([buffer], { type: "application/zip" });
                },
            }, {
                singleSchematicMode: true,
                backgroundColor: '#1a1a1a',
                showCameraPathVisualization: false,
                enableInteraction: true,
                showGrid: true,
                callbacks: {
                    onRendererInitialized: () => {
                        console.log('🎨 SchematicRenderer initialized (Callback)');
                        rendererRef.current = renderer;
                        setIsInitialized(true);
                        setIsLoading(false);
                    },
                    onSchematicLoaded: (schematicName: string) => {
                        console.log(`📦 Schematic loaded: ${schematicName}`);
                        setIsLoading(false);
                        console.log('Renderer state after load:', {
                            schematics: renderer.schematicManager?.getFirstSchematic()?.schematicWrapper.debug_info(),
                        });
                    },
                },
            });


        } catch (err) {
            setError('Failed to initialize schematic renderer.');
            console.error(err);
            setIsLoading(false);
        }
    }, [isInitialized]);

    const loadSchematics = useCallback(async () => {
        const renderer = rendererRef.current;

        if (!isInitialized || !renderer || !schematic) {
            console.log('📦 Not ready to load:', { isInitialized, hasRenderer: !!renderer, hasSchematic: !!schematic });
            return;
        }

        if (!renderer.schematicManager) {
            console.log('📦 SchematicManager not ready yet, will retry...');
            return;
        }

        console.log('📦 Loading new schematic');
        setIsLoading(true);
        setError(null);

        let dataToLoad: ArrayBuffer;

        // Handle cross-realm issues - instanceof can fail for data from workers
        // Check for Uint8Array-like objects that have buffer property
        if (schematic instanceof Uint8Array) {
            dataToLoad = schematic.slice().buffer;
        } else if (schematic instanceof ArrayBuffer) {
            dataToLoad = schematic;
        } else if (ArrayBuffer.isView(schematic)) {
            // Handle TypedArrays from different realms
            const view = schematic as Uint8Array;
            const buf = view.buffer as ArrayBuffer;
            dataToLoad = buf.slice(view.byteOffset, view.byteOffset + view.byteLength);
        } else if (schematic && typeof schematic === 'object' && 'byteLength' in schematic) {
            // Cross-realm typed array - convert to Uint8Array
            // This handles cases where instanceof fails due to realm differences
            const arr = schematic as unknown as { buffer?: ArrayBuffer; byteLength: number; byteOffset?: number; [index: number]: number };
            if (arr.buffer) {
                dataToLoad = arr.buffer.slice(arr.byteOffset || 0, (arr.byteOffset || 0) + arr.byteLength);
            } else {
                // Manually copy the data
                const temp = new Uint8Array(arr.byteLength);
                for (let i = 0; i < arr.byteLength; i++) {
                    temp[i] = arr[i];
                }
                dataToLoad = temp.buffer;
            }
        } else {
            console.error('Invalid schematic format:', typeof schematic, schematic);
            setError('Invalid schematic format');
            setIsLoading(false);
            return;
        }

        // Use a stable ID to allow replacement/updating
        const schematicId = 'viewed-schematic';

        try {
          

            await renderer.schematicManager.loadSchematic(schematicId, dataToLoad, {
                focused: false,
            });
            console.log('✅ Schematic loaded successfully');
            setIsLoading(false);
        } catch (loadError) {
            console.error('❌ Failed to load schematic:', loadError);
            setError('Failed to load schematic');
            setIsLoading(false);
        }
    }, [isInitialized, schematic]);

    const handleResize = useCallback(() => {
        rendererRef.current?.renderManager?.updateCanvasSize();
    }, []);

    useEffect(() => {
        console.log('Initializing SchematicRenderer...');
        const timer = setTimeout(initializeRenderer, 100);
        return () => clearTimeout(timer);
    }, [initializeRenderer]);

    useEffect(() => {
        if (!schematic) return;
        if (!isInitialized) return;

        const timer = setTimeout(() => {
            loadSchematics();
        }, 10);

        return () => clearTimeout(timer);
    }, [schematic, isInitialized, loadSchematics]);

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