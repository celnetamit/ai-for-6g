
// Note: this file previously carried a `declare global { namespace JSX }` block
// typing every three.js element as `any`. @react-three/fiber v9 supplies those
// element types itself, so the augmentation only suppressed real type checking
// inside the scene (and used the JSX namespace React 19 deprecates).
import React, { useRef, useMemo, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
// FIX: Import Line component from drei to avoid conflict with SVG line element
import { OrbitControls, Html, Grid, Billboard, Line } from '@react-three/drei';
import * as THREE from 'three';

/**
 * Labels are DOM, not 3D text, and that is a Content-Security-Policy decision.
 *
 * drei's <Text> is backed by troika, which needs a font file and defaults to
 * fetching one from a CDN. The production CSP sets `connect-src 'self'`, so
 * that fetch is refused — and because the <Text> sits inside the scene graph,
 * the rejection took the whole render with it. **The deployed Tools page showed
 * an empty box where the 3D visualisation should be**, while `npm run dev` and
 * `vite preview` — neither of which serves the CSP — rendered it perfectly.
 * That is why it survived every previous round of browser testing.
 *
 * Three ways out, and why this one:
 *   - weakening `connect-src` to allow a font CDN: a third-party origin added
 *     to the policy of every page, to letter four labels;
 *   - shipping a font: a ~150 kB binary and a licence to track, for four labels
 *     in one widget, in an app that otherwise uses only system fonts;
 *   - <Html>: drei projects a DOM node to a 3D position. No font fetch, no new
 *     asset, no policy change, and it inherits the app's own typography.
 *
 * The trade is that DOM labels do not occlude behind geometry. For four
 * annotations on a scene the learner rotates, that is the cheaper loss.
 */
const LABEL_CLASS =
  'pointer-events-none select-none whitespace-nowrap rounded bg-black/70 px-1.5 py-0.5 text-xs font-semibold text-white';

const IRS_ELEMENT_COUNT = 10;
const IRS_SIZE = 4;

// Type for the selected element state
type SelectedElement = {
    id: string;
    position: [number, number, number];
    phase: number;
} | null;

const IrsElement: React.FC<{
    position: [number, number, number];
    id: string;
    isSelected: boolean;
    onClick: (details: { id: string, position: [number, number, number], phase: number }) => void;
}> = ({ position, id, isSelected, onClick }) => {
    const meshRef = useRef<THREE.Mesh>(null!);
    const phaseRef = useRef(0);

    useFrame((state) => {
        if (!meshRef.current) return;
        const time = state.clock.getElapsedTime();
        // Calculate phase shift (value between 0 and 1)
        const phase = (Math.sin(time + position[0] * 2 + position[1] * 2) + 1) / 2;
        phaseRef.current = phase;

        const material = meshRef.current.material as THREE.MeshStandardMaterial;
        // Animate color based on phase shift
        material.color.setHSL(0.5 + phase * 0.2, 0.8, 0.5);

        // Add a subtle pulsing scale animation to indicate activity
        const scaleFactor = 1 + Math.sin(time * 4 + position[0]) * 0.05;
        meshRef.current.scale.set(scaleFactor, scaleFactor, 1);

        // Add a glow effect if the element is selected
        if (isSelected) {
            material.emissive.setHSL(0.5 + phase * 0.2, 0.8, 0.5);
            material.emissiveIntensity = 0.8;
        } else {
            material.emissive.set('black');
            material.emissiveIntensity = 0;
        }
    });

    const handleClick = (e: any) => {
        e.stopPropagation(); // Prevent orbit controls from moving on click
        onClick({ id, position, phase: phaseRef.current });
    };

    return (
        <mesh
            ref={meshRef}
            position={position}
            onClick={handleClick}
        >
            <boxGeometry args={[IRS_SIZE / IRS_ELEMENT_COUNT, IRS_SIZE / IRS_ELEMENT_COUNT, 0.05]} />
            <meshStandardMaterial />
        </mesh>
    );
};

const IrsSystem: React.FC = () => {
    const [selectedElement, setSelectedElement] = useState<SelectedElement>(null);

    const handleElementClick = (details: { id: string, position: [number, number, number], phase: number }) => {
        setSelectedElement(prev => {
            // If clicking the same element, deselect it. Otherwise, select the new one.
            if (prev && prev.id === details.id) {
                return null;
            }
            return details;
        });
    };

    const elements = useMemo(() => {
        const temp = [];
        const step = IRS_SIZE / IRS_ELEMENT_COUNT;
        const offset = -IRS_SIZE / 2 + step / 2;
        for (let i = 0; i < IRS_ELEMENT_COUNT; i++) {
            for (let j = 0; j < IRS_ELEMENT_COUNT; j++) {
                const id = `${i}-${j}`;
                const position: [number, number, number] = [offset + i * step, offset + j * step, 0];
                temp.push(
                    <IrsElement
                        key={id}
                        id={id}
                        position={position}
                        isSelected={selectedElement?.id === id}
                        onClick={handleElementClick}
                    />
                );
            }
        }
        return temp;
    }, [selectedElement]); // Re-render elements when selection changes

    return (
        <group>
            {elements}
            {selectedElement && (
                <Billboard
                    position={[
                        selectedElement.position[0],
                        selectedElement.position[1] + 0.5,
                        selectedElement.position[2]
                    ]}
                >
                    <Html center distanceFactor={12}>
                        <span className={LABEL_CLASS}>
                            {`Phase: ${selectedElement.phase.toFixed(2)}`}
                        </span>
                    </Html>
                </Billboard>
            )}
        </group>
    );
};


// FIX: Replaced custom Signal component using R3F <line> primitive with <Line> from trei
// to resolve JSX namespace conflicts with SVG elements.
const Signal: React.FC<{ from: THREE.Vector3; to: THREE.Vector3; color: string }> = ({ from, to, color }) => {
    // FIX: Initialize useRef with null. While useRef() is valid, it can cause issues with some toolchains or library versions. Using useRef(null) is more idiomatic for component refs.
    const ref = useRef<any>(null);
    useFrame((state) => {
        if (ref.current) {
            // Animate opacity on the material
            ref.current.material.opacity = (Math.sin(state.clock.getElapsedTime() * 5) + 1) / 2 * 0.8 + 0.2;
        }
    });
    return <Line ref={ref} points={[from, to]} color={color} transparent />;
};


const Scene: React.FC = () => {
    const transmitterPos = useMemo(() => new THREE.Vector3(-5, 2, 5), []);
    const irsCenterPos = useMemo(() => new THREE.Vector3(0, 0, 0), []);
    const receiverPos = useMemo(() => new THREE.Vector3(5, -2, 5), []);

    return (
        <>
            <ambientLight intensity={0.2} />
            <pointLight position={[10, 10, 10]} intensity={1} />

            <IrsSystem />
            <Signal from={transmitterPos} to={irsCenterPos} color="cyan" />
            <Signal from={irsCenterPos} to={receiverPos} color="lime" />
            
            <mesh position={transmitterPos}>
                <sphereGeometry args={[0.3, 16, 16]} />
                <meshStandardMaterial color="orange" />
            </mesh>
            <Billboard position={[-5, 2.5, 5]}>
                <Html center distanceFactor={12}>
                    <span className={LABEL_CLASS}>Transmitter</span>
                </Html>
            </Billboard>

            <mesh position={receiverPos}>
                <boxGeometry args={[0.4, 0.4, 0.4]} />
                <meshStandardMaterial color="purple" />
            </mesh>
            <Billboard position={[5, -1.5, 5]}>
                 <Html center distanceFactor={12}>
                    <span className={LABEL_CLASS}>Receiver</span>
                </Html>
            </Billboard>

            <Html position={[0, -2.5, 0]} center distanceFactor={12}>
                <span className={LABEL_CLASS}>Intelligent Reflecting Surface</span>
            </Html>
            
            <OrbitControls />
             {/* FIX: Replaced shorthand props rotation-x and position-z with their full array counterparts to prevent potential parsing issues in the R3F reconciler. */}
             <Grid args={[20, 20]} rotation={[Math.PI / 2, 0, 0]} position={[0, 0, -2]}/>
        </>
    );
};


const ThreeScene: React.FC = () => {
    return (
        <div className="w-full h-96 bg-gray-900 rounded-lg cursor-pointer">
             <Canvas camera={{ position: [0, 0, 10], fov: 50 }}>
                <React.Suspense fallback={null}>
                    <Scene />
                </React.Suspense>
            </Canvas>
        </div>
    );
};


export default ThreeScene;
