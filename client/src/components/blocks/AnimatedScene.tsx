import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
export default function AnimatedScene({
    bytes,
    onSample,
}: {
    bytes: Uint8Array;
    onSample: (ms: number) => void;
}) {
    const host = useRef<HTMLDivElement>(null),
        mixerRef = useRef<THREE.AnimationMixer | null>(null),
        playingRef = useRef(true),
        speedRef = useRef(1),
        timeRef = useRef(0),
        durationRef = useRef(0);
    const [playing, setPlaying] = useState(true),
        [speed, setSpeed] = useState(1),
        [duration, setDuration] = useState(0),
        [time, setTime] = useState(0),
        [error, setError] = useState("");
    useEffect(() => {
        playingRef.current = playing;
    }, [playing]);
    useEffect(() => {
        speedRef.current = speed;
    }, [speed]);
    useEffect(() => {
        if (!host.current) return;
        const el = host.current;
        let renderer: THREE.WebGLRenderer;
        try {
            renderer = new THREE.WebGLRenderer({ antialias: true });
        } catch (e) {
            setError(String(e));
            return;
        }
        renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
        el.appendChild(renderer.domElement);
        const scene = new THREE.Scene();
        scene.background = new THREE.Color("#151519");
        const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 10000);
        const controls = new OrbitControls(camera, renderer.domElement);
        scene.add(new THREE.HemisphereLight(0xffffff, 0x666666, 3));
        const sun = new THREE.DirectionalLight(0xffffff, 3);
        sun.position.set(10, 30, 20);
        scene.add(sun);
        let disposed = false,
            raf = 0,
            root: THREE.Group | undefined,
            last = performance.now(),
            lastUi = 0;
        const resize = new ResizeObserver(() => {
            const w = el.clientWidth,
                h = el.clientHeight;
            renderer.setSize(w, h);
            camera.aspect = w / h;
            camera.updateProjectionMatrix();
        });
        resize.observe(el);
        new GLTFLoader().parse(
            bytes.slice().buffer,
            "",
            (gltf) => {
                if (disposed) {
                    dispose(gltf.scene);
                    return;
                }
                root = gltf.scene;
                scene.add(root);
                const box = new THREE.Box3().setFromObject(root),
                    center = box.getCenter(new THREE.Vector3()),
                    size = Math.max(
                        1,
                        box.getSize(new THREE.Vector3()).length(),
                    );
                camera.position
                    .copy(center)
                    .add(new THREE.Vector3(size * 0.8, size * 0.6, size * 0.8));
                camera.near = size / 1000;
                camera.far = size * 100;
                camera.updateProjectionMatrix();
                controls.target.copy(center);
                controls.update();
                const mixer = new THREE.AnimationMixer(root);
                mixerRef.current = mixer;
                for (const clip of gltf.animations)
                    mixer.clipAction(clip).play();
                const d = Math.max(
                    0,
                    ...gltf.animations.map((c) => c.duration),
                );
                durationRef.current = d;
                setDuration(d);
            },
            (e) => setError(String(e)),
        );
        function tick(now: number) {
            if (disposed) return;
            const dt = Math.min(0.1, (now - last) / 1000);
            last = now;
            if (playingRef.current && durationRef.current > 0)
                timeRef.current =
                    (timeRef.current + dt * speedRef.current) %
                    durationRef.current;
            mixerRef.current?.setTime(timeRef.current);
            controls.update();
            renderer.render(scene, camera);
            if (now - lastUi > 100) {
                setTime(timeRef.current);
                lastUi = now;
            }
            raf = requestAnimationFrame(tick);
        }
        raf = requestAnimationFrame(tick);
        return () => {
            disposed = true;
            cancelAnimationFrame(raf);
            resize.disconnect();
            controls.dispose();
            if (root) {
                mixerRef.current?.stopAllAction();
                mixerRef.current?.uncacheRoot(root);
                dispose(root);
            }
            mixerRef.current = null;
            renderer.dispose();
            renderer.forceContextLoss();
            renderer.domElement.remove();
        };
    }, [bytes]);
    function dispose(root: THREE.Object3D) {
        root.traverse((o) => {
            const mesh = o as THREE.Mesh;
            if (mesh.geometry) mesh.geometry.dispose();
            for (const m of mesh.material
                ? Array.isArray(mesh.material)
                    ? mesh.material
                    : [mesh.material]
                : []) {
                for (const v of Object.values(m))
                    if (v instanceof THREE.Texture) v.dispose();
                m.dispose();
            }
        });
    }
    return (
        <div className="space-y-2">
            <div
                ref={host}
                className="h-80 w-full overflow-hidden rounded border border-white/10"
            />
            {error && <p role="alert">{error}</p>}
            <div className="flex items-center gap-3 text-xs">
                <button
                    className="rounded border border-white/15 px-3 py-2"
                    onClick={() => setPlaying(!playing)}
                >
                    {playing ? "Pause" : "Play"}
                </button>
                <input
                    aria-label="Animation timeline"
                    className="min-w-0 flex-1 accent-fuchsia-500"
                    type="range"
                    min={0}
                    max={duration || 1}
                    step={0.01}
                    value={time}
                    onChange={(e) => {
                        timeRef.current = Number(e.target.value);
                        setTime(timeRef.current);
                        setPlaying(false);
                    }}
                />
                <span>
                    {time.toFixed(2)} / {duration.toFixed(2)}s
                </span>
                <select
                    aria-label="Playback speed"
                    className="bg-neutral-950"
                    value={speed}
                    onChange={(e) => setSpeed(Number(e.target.value))}
                >
                    {[0.25, 0.5, 1, 2].map((s) => (
                        <option key={s} value={s}>
                            {s}×
                        </option>
                    ))}
                </select>
            </div>
            <button
                className="text-xs text-neutral-400"
                onClick={() => onSample(timeRef.current * 1000)}
            >
                Inspect frame at {time.toFixed(2)}s
            </button>
        </div>
    );
}
