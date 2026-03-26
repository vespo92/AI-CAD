import { useCadStore } from "@/lib/store/cad-store";
import { cn } from "@/lib/utils/cn";
import {
	Environment,
	GizmoHelper,
	GizmoViewport,
	Grid,
	OrbitControls,
} from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { useCallback, useMemo, useRef } from "react";
import * as THREE from "three";

function CadMesh() {
	const meshData = useCadStore((s) => s.meshData);
	const viewportSettings = useCadStore((s) => s.viewportSettings);
	const selectedFaceIndex = useCadStore((s) => s.selectedFaceIndex);
	const selectFace = useCadStore((s) => s.selectFace);
	const meshRef = useRef<THREE.Mesh>(null);

	const handleClick = useCallback(
		(event: { faceIndex?: number | null; stopPropagation: () => void }) => {
			event.stopPropagation();
			if (event.faceIndex != null) {
				selectFace(
					event.faceIndex === selectedFaceIndex ? null : event.faceIndex,
				);
			}
		},
		[selectFace, selectedFaceIndex],
	);

	const faceGeometry = useMemo(() => {
		if (!meshData?.faces) return null;

		const geom = new THREE.BufferGeometry();
		geom.setAttribute(
			"position",
			new THREE.BufferAttribute(meshData.faces.vertices, 3),
		);
		geom.setAttribute(
			"normal",
			new THREE.BufferAttribute(meshData.faces.normals, 3),
		);
		geom.setIndex(new THREE.BufferAttribute(meshData.faces.triangles, 1));
		return geom;
	}, [meshData]);

	const edgeGeometry = useMemo(() => {
		if (!meshData?.edges?.vertices?.length) return null;

		const geom = new THREE.BufferGeometry();
		geom.setAttribute(
			"position",
			new THREE.BufferAttribute(meshData.edges.vertices, 3),
		);
		return geom;
	}, [meshData]);

	if (!faceGeometry) return null;

	return (
		<group>
			{/* Solid mesh */}
			{/* biome-ignore lint/a11y/useKeyWithClickEvents: R3F mesh element, not a DOM element */}
			<mesh ref={meshRef} geometry={faceGeometry} onClick={handleClick}>
				<meshStandardMaterial
					color="#6b7280"
					metalness={0.3}
					roughness={0.6}
					side={THREE.DoubleSide}
				/>
			</mesh>

			{/* Selected face highlight */}
			{selectedFaceIndex !== null && faceGeometry && (
				<mesh geometry={faceGeometry}>
					<meshBasicMaterial
						color="#f97316"
						transparent
						opacity={0.15}
						side={THREE.DoubleSide}
						depthWrite={false}
					/>
				</mesh>
			)}

			{/* Wireframe overlay */}
			{viewportSettings.showWireframe && (
				<mesh geometry={faceGeometry}>
					<meshBasicMaterial
						color="#94a3b8"
						wireframe
						transparent
						opacity={0.3}
					/>
				</mesh>
			)}

			{/* Edge lines from replicad meshEdges */}
			{viewportSettings.showEdges && edgeGeometry && (
				<lineSegments geometry={edgeGeometry}>
					<lineBasicMaterial color="#475569" />
				</lineSegments>
			)}
		</group>
	);
}

function SceneSetup() {
	const viewportSettings = useCadStore((s) => s.viewportSettings);

	return (
		<>
			<ambientLight intensity={0.4} />
			<directionalLight position={[10, 10, 5]} intensity={0.8} />
			<directionalLight position={[-5, -5, -5]} intensity={0.3} />

			{viewportSettings.showGrid && (
				<Grid
					args={[200, 200]}
					cellSize={5}
					cellThickness={0.5}
					cellColor="#374151"
					sectionSize={25}
					sectionThickness={1}
					sectionColor="#4b5563"
					fadeDistance={100}
					infiniteGrid
				/>
			)}

			{viewportSettings.showAxes && <axesHelper args={[50]} />}

			<Environment preset="studio" />

			<OrbitControls
				makeDefault
				enableDamping
				dampingFactor={0.1}
				minDistance={5}
				maxDistance={500}
			/>

			<GizmoHelper alignment="bottom-right" margin={[80, 80]}>
				<GizmoViewport
					axisColors={["#ef4444", "#22c55e", "#3b82f6"]}
					labelColor="white"
				/>
			</GizmoHelper>
		</>
	);
}

interface CadViewportProps {
	className?: string;
}

export function CadViewport({ className }: CadViewportProps) {
	const isEngineReady = useCadStore((s) => s.isEngineReady);
	const isProcessing = useCadStore((s) => s.isProcessing);
	const viewportSettings = useCadStore((s) => s.viewportSettings);
	const containerRef = useRef<HTMLDivElement>(null);

	const handleCreated = useCallback(
		({ gl }: { gl: THREE.WebGLRenderer }) => {
			gl.setClearColor(viewportSettings.backgroundColor);
			gl.toneMapping = THREE.ACESFilmicToneMapping;
			gl.toneMappingExposure = 1.0;
		},
		[viewportSettings.backgroundColor],
	);

	return (
		<div ref={containerRef} className={cn("relative cad-viewport", className)}>
			<Canvas
				camera={{
					position: [60, 40, 60],
					fov: 45,
					near: 0.1,
					far: 2000,
				}}
				onCreated={handleCreated}
				gl={{
					antialias: true,
					alpha: false,
					powerPreference: "high-performance",
				}}
			>
				<SceneSetup />
				<CadMesh />
			</Canvas>

			{/* Status overlay */}
			<div className="absolute top-3 left-3 flex items-center gap-2">
				<div
					className={cn(
						"w-2 h-2 rounded-full",
						isEngineReady ? "bg-green-500" : "bg-yellow-500 animate-pulse",
					)}
				/>
				<span className="text-xs text-gray-400">
					{isEngineReady ? "Engine Ready" : "Loading Engine..."}
				</span>
			</div>

			{/* Processing overlay */}
			{isProcessing && (
				<div className="absolute inset-0 bg-black/30 flex items-center justify-center">
					<div className="bg-gray-800 rounded-lg px-4 py-3 flex items-center gap-3">
						<div className="animate-spin rounded-full h-5 w-5 border-b-2 border-forge-500" />
						<span className="text-sm text-gray-300">Processing...</span>
					</div>
				</div>
			)}

			{/* Viewport toolbar */}
			<div className="absolute bottom-3 left-3 flex items-center gap-1">
				<ViewportButton
					label="Grid"
					active={viewportSettings.showGrid}
					onClick={() =>
						useCadStore.setState((s) => ({
							viewportSettings: {
								...s.viewportSettings,
								showGrid: !s.viewportSettings.showGrid,
							},
						}))
					}
				/>
				<ViewportButton
					label="Edges"
					active={viewportSettings.showEdges}
					onClick={() =>
						useCadStore.setState((s) => ({
							viewportSettings: {
								...s.viewportSettings,
								showEdges: !s.viewportSettings.showEdges,
							},
						}))
					}
				/>
				<ViewportButton
					label="Wire"
					active={viewportSettings.showWireframe}
					onClick={() =>
						useCadStore.setState((s) => ({
							viewportSettings: {
								...s.viewportSettings,
								showWireframe: !s.viewportSettings.showWireframe,
							},
						}))
					}
				/>
			</div>
		</div>
	);
}

function ViewportButton({
	label,
	active,
	onClick,
}: { label: string; active: boolean; onClick: () => void }) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={cn(
				"px-2 py-1 text-xs rounded transition-colors",
				active
					? "bg-forge-600/80 text-white"
					: "bg-gray-800/80 text-gray-400 hover:text-gray-200",
			)}
		>
			{label}
		</button>
	);
}
