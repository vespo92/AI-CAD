/**
 * Interactive 2D Sketch Canvas with Constraint System
 *
 * Provides constraint-based sketching on a 2D plane.
 * Uses SVG for rendering and an iterative relaxation solver
 * for maintaining geometric relationships.
 *
 * Constraints: horizontal, vertical, coincident, distance,
 * equal, parallel, perpendicular.
 */

import { useCadEngine } from "@/hooks/use-cad-engine";
import {
	solveConstraints,
	suggestConstraints,
} from "@/lib/cad-engine/constraint-solver";
import { useCadStore } from "@/lib/store/cad-store";
import { useConsoleStore } from "@/lib/store/console-store";
import { cn } from "@/lib/utils/cn";
import type {
	Constraint,
	ConstraintType,
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

type SketchTool =
	| "select"
	| "line"
	| "rectangle"
	| "circle"
	| "constraint-h"
	| "constraint-v"
	| "constraint-distance"
	| "constraint-coincident"
	| "constraint-equal"
	| "constraint-perpendicular"
	| "constraint-parallel";

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
	autoConstrain: boolean;
	constraintSelection: string[];
}

const GRID_SIZE = 10;
const MIN_ZOOM = 0.2;
const MAX_ZOOM = 10;

export function SketchCanvas({
	className,
	plane: planeProp,
}: SketchCanvasProps) {
	const addMessage = useCadStore((s) => s.addChatMessage);
	const setEditorCode = useCadStore((s) => s.setEditorCode);
	const finishSketch = useCadStore((s) => s.finishSketch);
	const cancelSketchWorkflow = useCadStore((s) => s.cancelSketchWorkflow);
	const sketchWorkflow = useCadStore((s) => s.sketchWorkflow);
	const model = useCadStore((s) => s.model);
	const { execute } = useCadEngine();
	const consoleLog = useConsoleStore((s) => s.log);
	const svgRef = useRef<SVGSVGElement>(null);

	// The sketch plane: prop override → workflow plane → default XY
	const plane: SketchPlane = planeProp ?? sketchWorkflow.plane ?? "XY";

	// If we're editing an existing sketch feature, seed initial entities from it
	const initialFeature =
		sketchWorkflow.stage === "editing" && sketchWorkflow.featureId
			? model.features.find((f) => f.id === sketchWorkflow.featureId)
			: null;

	const [state, setState] = useState<CanvasState>({
		entities: initialFeature?.sketchData?.entities ?? [],
		constraints: initialFeature?.sketchData?.constraints ?? [],
		activeTool: "select",
		drawingPoints: [],
		pan: { x: 0, y: 0 },
		zoom: 1,
		gridSize: GRID_SIZE,
		snapToGrid: true,
		autoConstrain: true,
		constraintSelection: [],
	});
	const [mousePos, setMousePos] = useState<Point2D>({ x: 0, y: 0 });
	const [isPanning, setIsPanning] = useState(false);
	const [panStart, setPanStart] = useState<Point2D>({ x: 0, y: 0 });
	const [selectedEntity, setSelectedEntity] = useState<string | null>(null);
	const [unsatisfiedConstraints, setUnsatisfiedConstraints] = useState<
		Set<string>
	>(new Set());

	// Solve constraints whenever entities or constraints change
	useEffect(() => {
		if (state.constraints.length === 0) return;

		const result = solveConstraints(state.entities, state.constraints);
		if (!result.satisfied) {
			setUnsatisfiedConstraints(new Set(result.unsatisfied));
		} else {
			setUnsatisfiedConstraints(new Set());
		}

		// Only update if entities actually changed
		const changed = result.entities.some(
			(e, i) =>
				JSON.stringify(e.params) !== JSON.stringify(state.entities[i]?.params),
		);
		if (changed) {
			setState((s) => ({ ...s, entities: result.entities }));
		}
	}, [state.constraints, state.entities]);

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

			// Constraint tools: select entities
			if (state.activeTool.startsWith("constraint-")) {
				return; // Entity selection handled by EntityRenderer onClick
			}

			if (state.activeTool === "select") return;

			const world = snapPoint(screenToWorld(e.clientX, e.clientY));

			setState((s) => {
				const points = [...s.drawingPoints, world];

				if (s.activeTool === "line" && points.length === 2) {
					const entity: SketchEntity = {
						id: crypto.randomUUID(),
						type: "line",
						params: { start: points[0], end: points[1] },
					};
					const newEntities = [...s.entities, entity];

					// Auto-suggest constraints
					let newConstraints = s.constraints;
					if (s.autoConstrain) {
						const suggestions = suggestConstraints(entity, s.entities);
						if (suggestions.length > 0) {
							newConstraints = [...s.constraints, ...suggestions];
						}
					}

					return {
						...s,
						entities: newEntities,
						constraints: newConstraints,
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

	const handleEntityClick = useCallback(
		(entityId: string) => {
			if (state.activeTool === "select") {
				setSelectedEntity(entityId);
				return;
			}

			// Constraint tools
			if (state.activeTool.startsWith("constraint-")) {
				setState((s) => {
					const sel = [...s.constraintSelection, entityId];
					const constraintType = s.activeTool.replace(
						"constraint-",
						"",
					) as string;

					// Single-entity constraints
					if (
						(constraintType === "h" || constraintType === "v") &&
						sel.length === 1
					) {
						const type = constraintType === "h" ? "horizontal" : "vertical";
						const constraint: Constraint = {
							id: crypto.randomUUID(),
							type: type as ConstraintType,
							entities: sel,
						};
						return {
							...s,
							constraints: [...s.constraints, constraint],
							constraintSelection: [],
							activeTool: "select",
						};
					}

					// Distance constraint (single entity)
					if (constraintType === "distance" && sel.length === 1) {
						const value = Number(prompt("Enter distance value:", "50"));
						if (!Number.isNaN(value) && value > 0) {
							const constraint: Constraint = {
								id: crypto.randomUUID(),
								type: "distance",
								entities: sel,
								value,
							};
							return {
								...s,
								constraints: [...s.constraints, constraint],
								constraintSelection: [],
								activeTool: "select",
							};
						}
						return { ...s, constraintSelection: [], activeTool: "select" };
					}

					// Two-entity constraints
					if (
						["coincident", "equal", "perpendicular", "parallel"].includes(
							constraintType,
						) &&
						sel.length === 2
					) {
						const constraint: Constraint = {
							id: crypto.randomUUID(),
							type: constraintType as ConstraintType,
							entities: sel,
						};
						return {
							...s,
							constraints: [...s.constraints, constraint],
							constraintSelection: [],
							activeTool: "select",
						};
					}

					return { ...s, constraintSelection: sel };
				});
			}
		},
		[state.activeTool],
	);

	const handleKeyDown = useCallback(
		(e: KeyboardEvent) => {
			if (e.key === "Escape") {
				setState((s) => ({
					...s,
					drawingPoints: [],
					activeTool: "select",
					constraintSelection: [],
				}));
			}
			if (e.key === "Delete" && selectedEntity) {
				setState((s) => ({
					...s,
					entities: s.entities.filter((ent) => ent.id !== selectedEntity),
					constraints: s.constraints.filter(
						(c) => !c.entities.includes(selectedEntity),
					),
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

	// Finish the sketch — commit entities to the store and exit sketch mode.
	// The feature tree rebuild will then pick up this sketch when an Extrude
	// or Revolve feature is added.
	const handleFinishSketch = useCallback(() => {
		const sketchData = {
			plane,
			entities: state.entities,
			constraints: state.constraints,
		};
		const sketchId = finishSketch(sketchData);
		consoleLog(
			sketchId
				? `Finished sketch: ${state.entities.length} entities, ${state.constraints.length} constraints`
				: "Sketch was empty — discarded",
			"info",
			"system",
		);
		if (sketchId) {
			addMessage({
				role: "system",
				content: `Sketch${model.features.filter((f) => f.type === "sketch").length} created on ${plane} plane (${state.entities.length} entities). Add an Extrude or Revolve to build from it.`,
			});
		}
	}, [
		plane,
		state.entities,
		state.constraints,
		finishSketch,
		consoleLog,
		addMessage,
		model.features,
	]);

	// Generate Replicad code from sketch entities (legacy "Generate & Run" path)
	const generateCode = useCallback(async () => {
		if (state.entities.length === 0) return;

		const lines = [`// Sketch on ${plane} plane`];
		const shapes: string[] = [];
		let shapeIdx = 0;

		for (const entity of state.entities) {
			if (entity.type === "rectangle") {
				const start = entity.params.start as Point2D;
				const end = entity.params.end as Point2D;
				const w = Math.abs(end.x - start.x);
				const h = Math.abs(end.y - start.y);
				const cx = (start.x + end.x) / 2;
				const cy = (start.y + end.y) / 2;
				const name = `s${shapeIdx++}`;
				lines.push(
					`const ${name} = drawRoundedRectangle(${w.toFixed(1)}, ${h.toFixed(1)}, 0)`,
				);
				lines.push(`  .sketchOnPlane("${plane}")`);
				if (Math.abs(cx) > 0.1 || Math.abs(cy) > 0.1) {
					lines.push(`  .translate(${cx.toFixed(1)}, ${cy.toFixed(1)}, 0)`);
				}
				lines.push("  .extrude(10);");
				shapes.push(name);
			} else if (entity.type === "circle") {
				const center = entity.params.center as Point2D;
				const radius = entity.params.radius as number;
				const name = `s${shapeIdx++}`;
				lines.push(`const ${name} = drawCircle(${radius.toFixed(1)})`);
				lines.push(`  .sketchOnPlane("${plane}")`);
				if (Math.abs(center.x) > 0.1 || Math.abs(center.y) > 0.1) {
					lines.push(
						`  .translate(${center.x.toFixed(1)}, ${center.y.toFixed(1)}, 0)`,
					);
				}
				lines.push("  .extrude(10);");
				shapes.push(name);
			} else if (entity.type === "line") {
				// Lines contribute to a draw() path
			}
		}

		// Handle line entities as a connected path
		const lineEntities = state.entities.filter((e) => e.type === "line");
		if (lineEntities.length > 0) {
			const name = `s${shapeIdx++}`;
			const firstStart = lineEntities[0].params.start as Point2D;
			lines.push(`const ${name} = draw()`);
			lines.push(
				`  .movePointerTo([${firstStart.x.toFixed(1)}, ${firstStart.y.toFixed(1)}])`,
			);
			for (const line of lineEntities) {
				const end = line.params.end as Point2D;
				lines.push(`  .lineTo([${end.x.toFixed(1)}, ${end.y.toFixed(1)}])`);
			}
			lines.push("  .close()");
			lines.push(`  .sketchOnPlane("${plane}")`);
			lines.push("  .extrude(10);");
			shapes.push(name);
		}

		if (shapes.length === 0) return;

		lines.push("");
		if (shapes.length === 1) {
			lines.push(`return ${shapes[0]};`);
		} else {
			// Fuse all shapes
			lines.push(`let result = ${shapes[0]};`);
			for (let i = 1; i < shapes.length; i++) {
				lines.push(`result = result.fuse(${shapes[i]});`);
			}
			lines.push("return result;");
		}

		const code = lines.join("\n");
		setEditorCode(code);
		addMessage({
			role: "system",
			content: `Generated code from sketch (${state.entities.length} entities, ${state.constraints.length} constraints)`,
		});
		consoleLog(
			`Sketch → code: ${state.entities.length} entities, ${state.constraints.length} constraints`,
			"info",
			"system",
		);
		await execute(code);
	}, [
		state.entities,
		state.constraints.length,
		plane,
		setEditorCode,
		addMessage,
		consoleLog,
		execute,
	]);

	const transform = useMemo(
		() =>
			`translate(${state.pan.x}, ${state.pan.y}) scale(${state.zoom}, ${-state.zoom})`,
		[state.pan, state.zoom],
	);

	const constraintCount = state.constraints.length;
	const satisfiedCount = constraintCount - unsatisfiedConstraints.size;

	return (
		<div className={cn("flex flex-col bg-gray-900", className)}>
			{/* Sketch toolbar */}
			<div className="flex items-center gap-1 px-2 py-1 border-b border-gray-700 bg-gray-850 flex-wrap">
				{/* Drawing tools */}
				<ToolButton
					icon={CursorArrowRaysIcon}
					label="Select"
					active={state.activeTool === "select"}
					onClick={() =>
						setState((s) => ({
							...s,
							activeTool: "select",
							drawingPoints: [],
						}))
					}
				/>
				<ToolButton
					icon={MinusIcon}
					label="Line"
					active={state.activeTool === "line"}
					onClick={() =>
						setState((s) => ({
							...s,
							activeTool: "line",
							drawingPoints: [],
						}))
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
				<span className="text-[10px] text-gray-700 mx-0.5">|</span>

				{/* Constraint tools */}
				<ConstraintButton
					label="H"
					title="Horizontal"
					active={state.activeTool === "constraint-h"}
					onClick={() =>
						setState((s) => ({
							...s,
							activeTool: "constraint-h",
							constraintSelection: [],
						}))
					}
				/>
				<ConstraintButton
					label="V"
					title="Vertical"
					active={state.activeTool === "constraint-v"}
					onClick={() =>
						setState((s) => ({
							...s,
							activeTool: "constraint-v",
							constraintSelection: [],
						}))
					}
				/>
				<ConstraintButton
					label="D"
					title="Distance"
					active={state.activeTool === "constraint-distance"}
					onClick={() =>
						setState((s) => ({
							...s,
							activeTool: "constraint-distance",
							constraintSelection: [],
						}))
					}
				/>
				<ConstraintButton
					label="="
					title="Equal"
					active={state.activeTool === "constraint-equal"}
					onClick={() =>
						setState((s) => ({
							...s,
							activeTool: "constraint-equal",
							constraintSelection: [],
						}))
					}
				/>
				<ConstraintButton
					label={"\u22A5"}
					title="Perpendicular"
					active={state.activeTool === "constraint-perpendicular"}
					onClick={() =>
						setState((s) => ({
							...s,
							activeTool: "constraint-perpendicular",
							constraintSelection: [],
						}))
					}
				/>
				<ConstraintButton
					label="//"
					title="Parallel"
					active={state.activeTool === "constraint-parallel"}
					onClick={() =>
						setState((s) => ({
							...s,
							activeTool: "constraint-parallel",
							constraintSelection: [],
						}))
					}
				/>
				<ConstraintButton
					label={"\u2022"}
					title="Coincident"
					active={state.activeTool === "constraint-coincident"}
					onClick={() =>
						setState((s) => ({
							...s,
							activeTool: "constraint-coincident",
							constraintSelection: [],
						}))
					}
				/>

				<span className="text-[10px] text-gray-700 mx-0.5">|</span>

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

				{/* Auto-constrain toggle */}
				<button
					type="button"
					onClick={() =>
						setState((s) => ({ ...s, autoConstrain: !s.autoConstrain }))
					}
					className={cn(
						"px-1.5 py-0.5 text-[9px] rounded ml-1",
						state.autoConstrain
							? "bg-green-600/30 text-green-400"
							: "bg-gray-800 text-gray-500",
					)}
					title="Auto-detect constraints"
				>
					Auto
				</button>

				<div className="flex-1" />
				<span className="text-[10px] text-gray-500 mr-1">{plane} plane</span>
				<span className="text-[10px] text-gray-600 mr-1">
					{state.entities.length}E
				</span>
				{constraintCount > 0 && (
					<span
						className={cn(
							"text-[10px] mr-2",
							unsatisfiedConstraints.size > 0
								? "text-yellow-400"
								: "text-green-400",
						)}
					>
						{satisfiedCount}/{constraintCount}C
					</span>
				)}
				<button
					type="button"
					onClick={generateCode}
					disabled={state.entities.length === 0}
					className="px-2 py-0.5 text-[10px] text-gray-400 hover:text-gray-200 disabled:opacity-30"
					title="Generate replicad code and run in viewport (legacy)"
				>
					Run
				</button>
				<button
					type="button"
					onClick={cancelSketchWorkflow}
					className="px-2 py-0.5 text-[10px] bg-gray-700/80 text-gray-300 rounded hover:bg-gray-600"
				>
					Cancel
				</button>
				<button
					type="button"
					onClick={handleFinishSketch}
					disabled={state.entities.length === 0}
					className="px-2 py-0.5 text-[10px] bg-green-600/80 text-white rounded hover:bg-green-600 disabled:opacity-30"
					title="Exit sketch — the sketch becomes a feature you can extrude/revolve"
				>
					✓ Finish
				</button>
			</div>

			{/* Constraint selection hint */}
			{state.activeTool.startsWith("constraint-") && (
				<div className="px-2 py-1 bg-forge-600/10 text-forge-400 text-[10px] border-b border-gray-700">
					{state.constraintSelection.length === 0
						? "Click an entity to apply constraint"
						: `Selected ${state.constraintSelection.length} — click another or press Escape`}
				</div>
			)}

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
				<rect width="100%" height="100%" fill="#111318" />

				<g transform="translate(50%, 50%)">
					<g transform={transform}>
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
								selected={
									entity.id === selectedEntity ||
									state.constraintSelection.includes(entity.id)
								}
								onSelect={() => handleEntityClick(entity.id)}
							/>
						))}

						{/* Constraint indicators */}
						{state.constraints.map((constraint) => (
							<ConstraintIndicator
								key={constraint.id}
								constraint={constraint}
								entities={state.entities}
								unsatisfied={unsatisfiedConstraints.has(constraint.id)}
								zoom={state.zoom}
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

						{/* Cursor */}
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

// ─── Sub-components ──────────────────────────────────────────────

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

function ConstraintIndicator({
	constraint,
	entities,
	unsatisfied,
	zoom,
}: {
	constraint: Constraint;
	entities: SketchEntity[];
	unsatisfied: boolean;
	zoom: number;
}) {
	const entity = entities.find((e) => e.id === constraint.entities[0]);
	if (!entity) return null;

	const color = unsatisfied ? "#eab308" : "#22c55e";
	const fontSize = 8 / zoom;
	const offset = 6 / zoom;

	let pos: Point2D = { x: 0, y: 0 };

	if (entity.type === "line") {
		const start = entity.params.start as Point2D;
		const end = entity.params.end as Point2D;
		pos = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
	} else if (entity.type === "circle") {
		pos = entity.params.center as Point2D;
	} else if (entity.type === "rectangle") {
		const start = entity.params.start as Point2D;
		const end = entity.params.end as Point2D;
		pos = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
	}

	const labels: Record<string, string> = {
		horizontal: "H",
		vertical: "V",
		coincident: "\u2022",
		distance: `D:${constraint.value ?? "?"}`,
		equal: "=",
		perpendicular: "\u22A5",
		parallel: "//",
		tangent: "T",
		symmetric: "S",
		angle: "\u2220",
	};

	return (
		<text
			x={pos.x + offset}
			y={pos.y - offset}
			fill={color}
			fontSize={fontSize}
			fontFamily="monospace"
			fontWeight="bold"
		>
			{labels[constraint.type] || constraint.type[0].toUpperCase()}
		</text>
	);
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

function ConstraintButton({
	label,
	title,
	active,
	onClick,
}: {
	label: string;
	title: string;
	active: boolean;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={cn(
				"w-5 h-5 text-[10px] font-mono rounded flex items-center justify-center transition-colors",
				active
					? "bg-green-600/30 text-green-400"
					: "text-gray-500 hover:text-gray-300 hover:bg-gray-800",
			)}
			title={title}
		>
			{label}
		</button>
	);
}
