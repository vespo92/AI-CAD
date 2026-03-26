/**
 * Interactive 2D Sketch Canvas
 *
 * Provides constraint-based sketching on a 2D plane.
 * Uses SVG for rendering and a constraint solver for maintaining
 * geometric relationships.
 *
 * Future: Wire to planegcs WASM for industrial-grade constraint solving.
 * Current: Basic geometric primitive drawing with snap-to-grid.
 */

import { useCadStore } from "@/lib/store/cad-store";
import { cn } from "@/lib/utils/cn";
import type {
	Constraint,
	Point2D,
	SketchEntity,
	SketchPlane,
} from "@/types/cad";
import {
	ArrowUturnLeftIcon,
	CursorArrowRaysIcon,
	MinusIcon,
	StopIcon,
} from "@heroicons/react/24/outline";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type SketchTool = "select" | "line" | "rectangle" | "circle" | "arc";

interface SketchCanvasProps {
	className?: string;
	plane?: SketchPlane;
}

interface CanvasState {
	entities: SketchEntity[];
	constraints: Constraint[];
	activeTool: SketchTool;
	drawingPoints: Point2D[];
	pan: Point2D;
	zoom: number;
	gridSize: number;
	snapToGrid: boolean;
}

const GRID_SIZE = 10;
const MIN_ZOOM = 0.2;
const MAX_ZOOM = 10;

export function SketchCanvas({ className, plane = "XY" }: SketchCanvasProps) {
	const addMessage = useCadStore((s) => s.addChatMessage);
	const setEditorCode = useCadStore((s) => s.setEditorCode);
	const svgRef = useRef<SVGSVGElement>(null);
	const [state, setState] = useState<CanvasState>({
		entities: [],
		constraints: [],
		activeTool: "select",
		drawingPoints: [],
		pan: { x: 0, y: 0 },
		zoom: 1,
		gridSize: GRID_SIZE,
		snapToGrid: true,
	});
	const [mousePos, setMousePos] = useState<Point2D>({ x: 0, y: 0 });
	const [isPanning, setIsPanning] = useState(false);
	const [panStart, setPanStart] = useState<Point2D>({ x: 0, y: 0 });
	const [selectedEntity, setSelectedEntity] = useState<string | null>(null);

	const snapPoint = useCallback(
		(p: Point2D): Point2D => {
			if (!state.snapToGrid) return p;
			return {
				x: Math.round(p.x / state.gridSize) * state.gridSize,
				y: Math.round(p.y / state.gridSize) * state.gridSize,
			};
		},
		[state.snapToGrid, state.gridSize],
	);

	const screenToWorld = useCallback(
		(screenX: number, screenY: number): Point2D => {
			const svg = svgRef.current;
			if (!svg) return { x: 0, y: 0 };
			const rect = svg.getBoundingClientRect();
			const cx = rect.width / 2;
			const cy = rect.height / 2;
			return {
				x: (screenX - rect.left - cx - state.pan.x) / state.zoom,
				y: -(screenY - rect.top - cy - state.pan.y) / state.zoom,
			};
		},
		[state.pan, state.zoom],
	);

	const handleMouseMove = useCallback(
		(e: React.MouseEvent) => {
			const world = screenToWorld(e.clientX, e.clientY);
			setMousePos(snapPoint(world));

			if (isPanning) {
				setState((s) => ({
					...s,
					pan: {
						x: s.pan.x + e.clientX - panStart.x,
						y: s.pan.y + e.clientY - panStart.y,
					},
				}));
				setPanStart({ x: e.clientX, y: e.clientY });
			}
		},
		[screenToWorld, snapPoint, isPanning, panStart],
	);

	const handleMouseDown = useCallback(
		(e: React.MouseEvent) => {
			if (e.button === 1 || (e.button === 0 && e.altKey)) {
				setIsPanning(true);
				setPanStart({ x: e.clientX, y: e.clientY });
				return;
			}

			if (state.activeTool === "select") return;

			const world = snapPoint(screenToWorld(e.clientX, e.clientY));

			setState((s) => {
				const points = [...s.drawingPoints, world];

				// Complete entity based on tool
				if (s.activeTool === "line" && points.length === 2) {
					const entity: SketchEntity = {
						id: crypto.randomUUID(),
						type: "line",
						params: { start: points[0], end: points[1] },
					};
					return {
						...s,
						entities: [...s.entities, entity],
						drawingPoints: [],
					};
				}

				if (s.activeTool === "rectangle" && points.length === 2) {
					const entity: SketchEntity = {
						id: crypto.randomUUID(),
						type: "rectangle",
						params: { start: points[0], end: points[1] },
					};
					return {
						...s,
						entities: [...s.entities, entity],
						drawingPoints: [],
					};
				}

				if (s.activeTool === "circle" && points.length === 2) {
					const dx = points[1].x - points[0].x;
					const dy = points[1].y - points[0].y;
					const radius = Math.sqrt(dx * dx + dy * dy);
					const entity: SketchEntity = {
						id: crypto.randomUUID(),
						type: "circle",
						params: { center: points[0], radius },
					};
					return {
						...s,
						entities: [...s.entities, entity],
						drawingPoints: [],
					};
				}

				return { ...s, drawingPoints: points };
			});
		},
		[state.activeTool, snapPoint, screenToWorld],
	);

	const handleMouseUp = useCallback(() => {
		setIsPanning(false);
	}, []);

	const handleWheel = useCallback((e: React.WheelEvent) => {
		e.preventDefault();
		const factor = e.deltaY > 0 ? 0.9 : 1.1;
		setState((s) => ({
			...s,
			zoom: Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, s.zoom * factor)),
		}));
	}, []);

	const handleKeyDown = useCallback(
		(e: KeyboardEvent) => {
			if (e.key === "Escape") {
				setState((s) => ({ ...s, drawingPoints: [], activeTool: "select" }));
			}
			if (e.key === "Delete" && selectedEntity) {
				setState((s) => ({
					...s,
					entities: s.entities.filter((ent) => ent.id !== selectedEntity),
				}));
				setSelectedEntity(null);
			}
		},
		[selectedEntity],
	);

	useEffect(() => {
		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [handleKeyDown]);

	// Generate Replicad code from sketch entities
	const generateCode = useCallback(() => {
		if (state.entities.length === 0) return;

		const lines = [`// Sketch on ${plane} plane`];
		let hasLines = false;

		for (const entity of state.entities) {
			if (entity.type === "rectangle") {
				const start = entity.params.start as Point2D;
				const end = entity.params.end as Point2D;
				const w = Math.abs(end.x - start.x);
				const h = Math.abs(end.y - start.y);
				lines.push(
					`const rect = drawRoundedRectangle(${w.toFixed(1)}, ${h.toFixed(1)}, 0)`,
				);
				lines.push(`  .sketchOnPlane("${plane}")`);
				lines.push("  .extrude(10);");
				hasLines = true;
			} else if (entity.type === "circle") {
				const radius = entity.params.radius as number;
				lines.push(`const circ = drawCircle(${radius.toFixed(1)})`);
				lines.push(`  .sketchOnPlane("${plane}")`);
				lines.push("  .extrude(10);");
				hasLines = true;
			} else if (entity.type === "line") {
				// Lines get aggregated into a draw() path
				if (!hasLines) {
					const start = entity.params.start as Point2D;
					lines.push("const profile = draw()");
					lines.push(
						`  .movePointerTo([${start.x.toFixed(1)}, ${start.y.toFixed(1)}])`,
					);
				}
				const end = entity.params.end as Point2D;
				lines.push(`  .lineTo([${end.x.toFixed(1)}, ${end.y.toFixed(1)}])`);
				hasLines = true;
			}
		}

		if (hasLines) {
			lines.push("");
			lines.push("// Combine and return");
			lines.push(
				'const shape = rect || circ || profile.close().sketchOnPlane("XY").extrude(10);',
			);
			lines.push("return shape;");
		}

		const code = lines.join("\n");
		setEditorCode(code);
		addMessage({
			role: "system",
			content: `Generated code from sketch (${state.entities.length} entities)`,
		});
	}, [state.entities, plane, setEditorCode, addMessage]);

	// Transform string for SVG
	const transform = useMemo(
		() =>
			`translate(${state.pan.x}, ${state.pan.y}) scale(${state.zoom}, ${-state.zoom})`,
		[state.pan, state.zoom],
	);

	return (
		<div className={cn("flex flex-col bg-gray-900", className)}>
			{/* Sketch toolbar */}
			<div className="flex items-center gap-1 px-2 py-1 border-b border-gray-700 bg-gray-850">
				<ToolButton
					icon={CursorArrowRaysIcon}
					label="Select"
					active={state.activeTool === "select"}
					onClick={() =>
						setState((s) => ({ ...s, activeTool: "select", drawingPoints: [] }))
					}
				/>
				<ToolButton
					icon={MinusIcon}
					label="Line"
					active={state.activeTool === "line"}
					onClick={() =>
						setState((s) => ({ ...s, activeTool: "line", drawingPoints: [] }))
					}
				/>
				<ToolButton
					icon={StopIcon}
					label="Rectangle"
					active={state.activeTool === "rectangle"}
					onClick={() =>
						setState((s) => ({
							...s,
							activeTool: "rectangle",
							drawingPoints: [],
						}))
					}
				/>
				<span className="text-[10px] text-gray-600 mx-1">|</span>
				<ToolButton
					icon={ArrowUturnLeftIcon}
					label="Undo"
					onClick={() =>
						setState((s) => ({
							...s,
							entities: s.entities.slice(0, -1),
						}))
					}
				/>
				<div className="flex-1" />
				<span className="text-[10px] text-gray-500 mr-2">
					{plane} plane • {state.entities.length} entities
				</span>
				<button
					type="button"
					onClick={generateCode}
					disabled={state.entities.length === 0}
					className="px-2 py-0.5 text-[10px] bg-forge-600/80 text-white rounded hover:bg-forge-600 disabled:opacity-30"
				>
					Generate Code
				</button>
			</div>

			{/* SVG Canvas */}
			{/* biome-ignore lint/a11y/noSvgWithoutTitle: interactive sketch canvas, not decorative */}
			<svg
				ref={svgRef}
				className="flex-1 cursor-crosshair"
				onMouseMove={handleMouseMove}
				onMouseDown={handleMouseDown}
				onMouseUp={handleMouseUp}
				onWheel={handleWheel}
			>
				{/* Background */}
				<rect width="100%" height="100%" fill="#111318" />

				<g transform="translate(50%, 50%)">
					<g transform={transform}>
						{/* Grid */}
						<GridPattern size={state.gridSize} extent={500} />

						{/* Origin crosshair */}
						<line
							x1={-200}
							y1={0}
							x2={200}
							y2={0}
							stroke="#ef4444"
							strokeWidth={0.5}
							opacity={0.3}
						/>
						<line
							x1={0}
							y1={-200}
							x2={0}
							y2={200}
							stroke="#22c55e"
							strokeWidth={0.5}
							opacity={0.3}
						/>

						{/* Existing entities */}
						{state.entities.map((entity) => (
							<EntityRenderer
								key={entity.id}
								entity={entity}
								selected={entity.id === selectedEntity}
								onSelect={() => setSelectedEntity(entity.id)}
							/>
						))}

						{/* Drawing preview */}
						{state.drawingPoints.length > 0 && (
							<DrawingPreview
								tool={state.activeTool}
								points={state.drawingPoints}
								cursor={mousePos}
							/>
						)}

						{/* Cursor position */}
						<circle
							cx={mousePos.x}
							cy={mousePos.y}
							r={2 / state.zoom}
							fill="#f97316"
							opacity={0.8}
						/>
					</g>
				</g>

				{/* Coordinate display */}
				<text x={10} y={20} fill="#6b7280" fontSize={11} fontFamily="monospace">
					{`X: ${mousePos.x.toFixed(1)}  Y: ${mousePos.y.toFixed(1)}`}
				</text>
			</svg>
		</div>
	);
}

function GridPattern({ size, extent }: { size: number; extent: number }) {
	const lines = [];
	for (let i = -extent; i <= extent; i += size) {
		lines.push(
			<line
				key={`h${i}`}
				x1={-extent}
				y1={i}
				x2={extent}
				y2={i}
				stroke="#1f2937"
				strokeWidth={i % (size * 5) === 0 ? 0.5 : 0.2}
			/>,
		);
		lines.push(
			<line
				key={`v${i}`}
				x1={i}
				y1={-extent}
				x2={i}
				y2={extent}
				stroke="#1f2937"
				strokeWidth={i % (size * 5) === 0 ? 0.5 : 0.2}
			/>,
		);
	}
	return <>{lines}</>;
}

function EntityRenderer({
	entity,
	selected,
	onSelect,
}: {
	entity: SketchEntity;
	selected: boolean;
	onSelect: () => void;
}) {
	const stroke = selected ? "#f97316" : "#60a5fa";
	const strokeWidth = selected ? 1.5 : 1;

	switch (entity.type) {
		case "line": {
			const start = entity.params.start as Point2D;
			const end = entity.params.end as Point2D;
			return (
				// biome-ignore lint/a11y/useKeyWithClickEvents: SVG sketch entity
				<line
					x1={start.x}
					y1={start.y}
					x2={end.x}
					y2={end.y}
					stroke={stroke}
					strokeWidth={strokeWidth}
					onClick={onSelect}
					className="cursor-pointer"
				/>
			);
		}
		case "rectangle": {
			const s = entity.params.start as Point2D;
			const e = entity.params.end as Point2D;
			const x = Math.min(s.x, e.x);
			const y = Math.min(s.y, e.y);
			const w = Math.abs(e.x - s.x);
			const h = Math.abs(e.y - s.y);
			return (
				// biome-ignore lint/a11y/useKeyWithClickEvents: SVG sketch entity
				<rect
					x={x}
					y={y}
					width={w}
					height={h}
					fill="none"
					stroke={stroke}
					strokeWidth={strokeWidth}
					onClick={onSelect}
					className="cursor-pointer"
				/>
			);
		}
		case "circle": {
			const center = entity.params.center as Point2D;
			const radius = entity.params.radius as number;
			return (
				// biome-ignore lint/a11y/useKeyWithClickEvents: SVG sketch entity
				<circle
					cx={center.x}
					cy={center.y}
					r={radius}
					fill="none"
					stroke={stroke}
					strokeWidth={strokeWidth}
					onClick={onSelect}
					className="cursor-pointer"
				/>
			);
		}
		default:
			return null;
	}
}

function DrawingPreview({
	tool,
	points,
	cursor,
}: {
	tool: SketchTool;
	points: Point2D[];
	cursor: Point2D;
}) {
	if (points.length === 0) return null;

	const start = points[0];

	switch (tool) {
		case "line":
			return (
				<line
					x1={start.x}
					y1={start.y}
					x2={cursor.x}
					y2={cursor.y}
					stroke="#f97316"
					strokeWidth={1}
					strokeDasharray="4 2"
					opacity={0.7}
				/>
			);
		case "rectangle":
			return (
				<rect
					x={Math.min(start.x, cursor.x)}
					y={Math.min(start.y, cursor.y)}
					width={Math.abs(cursor.x - start.x)}
					height={Math.abs(cursor.y - start.y)}
					fill="none"
					stroke="#f97316"
					strokeWidth={1}
					strokeDasharray="4 2"
					opacity={0.7}
				/>
			);
		case "circle": {
			const dx = cursor.x - start.x;
			const dy = cursor.y - start.y;
			const r = Math.sqrt(dx * dx + dy * dy);
			return (
				<circle
					cx={start.x}
					cy={start.y}
					r={r}
					fill="none"
					stroke="#f97316"
					strokeWidth={1}
					strokeDasharray="4 2"
					opacity={0.7}
				/>
			);
		}
		default:
			return null;
	}
}

function ToolButton({
	icon: Icon,
	label,
	active,
	onClick,
}: {
	icon: React.ComponentType<{ className?: string }>;
	label: string;
	active?: boolean;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={cn(
				"p-1 rounded transition-colors",
				active
					? "bg-forge-600/30 text-forge-400"
					: "text-gray-500 hover:text-gray-300 hover:bg-gray-800",
			)}
			title={label}
		>
			<Icon className="w-3.5 h-3.5" />
		</button>
	);
}
