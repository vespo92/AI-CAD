/**
 * PropertyManager Panel (SolidWorks-style)
 *
 * Opens on the right side of the workspace when a feature is being created
 * or edited. Shows type-specific parameter inputs (depth, direction, angle,
 * axis, radius, etc.) and commits changes live to the feature tree. Committing
 * or canceling returns to the normal workspace.
 */

import { useCadEngine } from "@/hooks/use-cad-engine";
import { generateCodeFromFeatures } from "@/lib/cad-engine/feature-codegen";
import { useCadStore } from "@/lib/store/cad-store";
import { cn } from "@/lib/utils/cn";
import type { Feature, SketchPlane } from "@/types/cad";
import { CheckIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { useCallback, useEffect, useMemo } from "react";

interface PropertyManagerProps {
	className?: string;
}

export function PropertyManager({ className }: PropertyManagerProps) {
	const propertyManager = useCadStore((s) => s.propertyManager);
	const model = useCadStore((s) => s.model);
	const updateParams = useCadStore((s) => s.updateEditingFeatureParams);
	const closePropertyManager = useCadStore((s) => s.closePropertyManager);
	const setEditorCode = useCadStore((s) => s.setEditorCode);
	const { execute } = useCadEngine();

	const feature = useMemo(() => {
		if (!propertyManager) return null;
		return (
			model.features.find((f) => f.id === propertyManager.featureId) ?? null
		);
	}, [model.features, propertyManager]);

	// Live preview: rebuild and run the model whenever params change
	const paramsKey = feature ? JSON.stringify(feature.params) : "";
	// biome-ignore lint/correctness/useExhaustiveDependencies: paramsKey captures param mutations
	useEffect(() => {
		if (!feature) return;
		const code = generateCodeFromFeatures(model.features);
		setEditorCode(code);
		execute(code);
	}, [paramsKey, feature?.id]);

	const commit = useCallback(() => {
		closePropertyManager(true);
	}, [closePropertyManager]);

	const cancel = useCallback(async () => {
		closePropertyManager(false);
		// After cancel, rebuild model from surviving features
		const features = useCadStore.getState().model.features;
		const code = generateCodeFromFeatures(features);
		setEditorCode(code);
		await execute(code);
	}, [closePropertyManager, setEditorCode, execute]);

	if (!propertyManager || !feature) {
		return (
			<div
				className={cn(
					"flex flex-col items-center justify-center text-center px-4 py-8 text-gray-500",
					className,
				)}
			>
				<p className="text-[11px]">
					Select a feature and click edit, or create a new feature to edit its
					properties here.
				</p>
			</div>
		);
	}

	return (
		<div className={cn("flex flex-col h-full", className)}>
			{/* Header */}
			<div className="flex items-center justify-between px-3 py-2 border-b border-gray-700 bg-gray-850">
				<div className="flex items-center gap-2 min-w-0">
					<span className="text-[11px] font-semibold text-forge-400 uppercase tracking-wider truncate">
						{propertyManager.isNew ? "New Feature" : "Edit"}
					</span>
					<span className="text-[11px] text-gray-300 truncate">
						{feature.name}
					</span>
				</div>
				<div className="flex items-center gap-1">
					<button
						type="button"
						onClick={cancel}
						className="p-1 text-gray-400 hover:text-red-400 rounded"
						title={propertyManager.isNew ? "Cancel" : "Revert"}
					>
						<XMarkIcon className="w-4 h-4" />
					</button>
					<button
						type="button"
						onClick={commit}
						className="p-1 text-gray-400 hover:text-green-400 rounded"
						title={propertyManager.isNew ? "Create" : "Apply"}
					>
						<CheckIcon className="w-4 h-4" />
					</button>
				</div>
			</div>

			{/* Type-specific property editor */}
			<div className="flex-1 overflow-y-auto p-3 space-y-3">
				<FeaturePropertyEditor
					feature={feature}
					onUpdate={updateParams}
					model={model}
				/>
			</div>

			{/* Footer buttons — SolidWorks-style big confirm/cancel */}
			<div className="flex items-center gap-2 px-3 py-2 border-t border-gray-700 bg-gray-850">
				<button
					type="button"
					onClick={cancel}
					className="flex-1 py-1.5 text-[11px] text-gray-300 bg-gray-800 rounded hover:bg-gray-700"
				>
					Cancel
				</button>
				<button
					type="button"
					onClick={commit}
					className="flex-1 py-1.5 text-[11px] text-white bg-forge-600 rounded hover:bg-forge-500 font-medium"
				>
					{propertyManager.isNew ? "Create" : "Apply"}
				</button>
			</div>
		</div>
	);
}

// ─── Type-specific editors ─────────────────────────────────────

function FeaturePropertyEditor({
	feature,
	onUpdate,
	model,
}: {
	feature: Feature;
	onUpdate: (updates: Record<string, unknown>) => void;
	model: { features: Feature[] };
}) {
	switch (feature.type) {
		case "extrude":
		case "extrude-cut":
			return (
				<ExtrudeEditor feature={feature} onUpdate={onUpdate} model={model} />
			);
		case "revolve":
		case "revolve-cut":
			return (
				<RevolveEditor feature={feature} onUpdate={onUpdate} model={model} />
			);
		case "fillet":
			return <FilletEditor feature={feature} onUpdate={onUpdate} />;
		case "chamfer":
			return <ChamferEditor feature={feature} onUpdate={onUpdate} />;
		case "shell":
			return <ShellEditor feature={feature} onUpdate={onUpdate} />;
		case "mirror":
			return <MirrorEditor feature={feature} onUpdate={onUpdate} />;
		case "pattern":
			return <PatternEditor feature={feature} onUpdate={onUpdate} />;
		case "sketch":
			return <SketchSummary feature={feature} />;
		default:
			return <GenericEditor feature={feature} onUpdate={onUpdate} />;
	}
}

function Section({
	title,
	children,
}: {
	title: string;
	children: React.ReactNode;
}) {
	return (
		<div className="space-y-1.5">
			<div className="text-[9px] font-semibold text-gray-600 uppercase tracking-wider">
				{title}
			</div>
			<div className="space-y-1.5 bg-gray-900/50 border border-gray-800 rounded p-2">
				{children}
			</div>
		</div>
	);
}

function NumberField({
	label,
	value,
	unit,
	min,
	max,
	step,
	onChange,
}: {
	label: string;
	value: number;
	unit?: string;
	min?: number;
	max?: number;
	step?: number;
	onChange: (v: number) => void;
}) {
	return (
		<label className="flex items-center gap-2 text-[11px]">
			<span className="w-24 text-gray-400">{label}</span>
			<input
				type="number"
				value={value}
				min={min}
				max={max}
				step={step ?? 0.1}
				onChange={(e) => onChange(Number(e.target.value))}
				className="flex-1 min-w-0 px-2 py-1 bg-gray-800 border border-gray-700 rounded text-gray-200 focus:outline-none focus:border-forge-500"
			/>
			{unit && <span className="text-gray-600 w-6 text-[10px]">{unit}</span>}
		</label>
	);
}

function SelectField({
	label,
	value,
	options,
	onChange,
}: {
	label: string;
	value: string;
	options: { label: string; value: string }[];
	onChange: (v: string) => void;
}) {
	return (
		<label className="flex items-center gap-2 text-[11px]">
			<span className="w-24 text-gray-400">{label}</span>
			<select
				value={value}
				onChange={(e) => onChange(e.target.value)}
				className="flex-1 px-2 py-1 bg-gray-800 border border-gray-700 rounded text-gray-200 focus:outline-none focus:border-forge-500"
			>
				{options.map((opt) => (
					<option key={opt.value} value={opt.value}>
						{opt.label}
					</option>
				))}
			</select>
		</label>
	);
}

function SketchPicker({
	label,
	value,
	model,
	onChange,
}: {
	label: string;
	value?: string;
	model: { features: Feature[] };
	onChange: (id: string) => void;
}) {
	const sketches = model.features.filter((f) => f.type === "sketch");
	if (sketches.length === 0) {
		return (
			<div className="text-[10px] text-yellow-400 px-1 py-0.5">
				No sketches available. Use "New Sketch" in the ribbon first.
			</div>
		);
	}
	return (
		<SelectField
			label={label}
			value={value ?? sketches[sketches.length - 1].id}
			options={sketches.map((s) => ({ label: s.name, value: s.id }))}
			onChange={onChange}
		/>
	);
}

function ExtrudeEditor({
	feature,
	onUpdate,
	model,
}: {
	feature: Feature;
	onUpdate: (u: Record<string, unknown>) => void;
	model: { features: Feature[] };
}) {
	const p = feature.params as Record<string, unknown>;
	const depth = (p.depth as number) ?? (p.height as number) ?? 20;
	const direction = (p.direction as string) || "normal";
	const isCut = feature.type === "extrude-cut";

	const updateSketchId = useCallback(
		(id: string) => {
			// sketchId lives outside params; update the store entry directly
			useCadStore.setState((state) => ({
				model: {
					...state.model,
					features: state.model.features.map((f) =>
						f.id === feature.id ? { ...f, sketchId: id } : f,
					),
				},
			}));
		},
		[feature.id],
	);

	return (
		<>
			<Section title="Sketch">
				<SketchPicker
					label="From sketch"
					value={feature.sketchId}
					model={model}
					onChange={updateSketchId}
				/>
			</Section>

			<Section title="Direction 1">
				<SelectField
					label="End condition"
					value={direction}
					options={[
						{ label: "Blind (normal)", value: "normal" },
						{ label: "Reverse direction", value: "reverse" },
						{ label: "Mid plane (symmetric)", value: "symmetric" },
					]}
					onChange={(v) => onUpdate({ direction: v })}
				/>
				<NumberField
					label="Depth"
					value={depth}
					unit="mm"
					min={0}
					step={1}
					onChange={(v) => onUpdate({ depth: v })}
				/>
			</Section>

			{!isCut && (
				<Section title="Result">
					<div className="text-[10px] text-gray-500 leading-snug">
						Boss adds material. The new extrusion will be fused into the
						existing solid, or start a new body if nothing exists yet.
					</div>
				</Section>
			)}
			{isCut && (
				<Section title="Result">
					<div className="text-[10px] text-red-300/80 leading-snug">
						Cut removes material — the extruded tool is subtracted from the
						current solid.
					</div>
				</Section>
			)}
		</>
	);
}

function RevolveEditor({
	feature,
	onUpdate,
	model,
}: {
	feature: Feature;
	onUpdate: (u: Record<string, unknown>) => void;
	model: { features: Feature[] };
}) {
	const p = feature.params as Record<string, unknown>;
	const axis = (p.axis as string) || "Y";
	const angle = (p.angle as number) ?? 360;
	const isCut = feature.type === "revolve-cut";

	const updateSketchId = useCallback(
		(id: string) => {
			useCadStore.setState((state) => ({
				model: {
					...state.model,
					features: state.model.features.map((f) =>
						f.id === feature.id ? { ...f, sketchId: id } : f,
					),
				},
			}));
		},
		[feature.id],
	);

	return (
		<>
			<Section title="Sketch">
				<SketchPicker
					label="Profile"
					value={feature.sketchId}
					model={model}
					onChange={updateSketchId}
				/>
			</Section>

			<Section title="Axis of Revolution">
				<SelectField
					label="Axis"
					value={axis}
					options={[
						{ label: "X Axis", value: "X" },
						{ label: "Y Axis", value: "Y" },
						{ label: "Z Axis", value: "Z" },
					]}
					onChange={(v) => onUpdate({ axis: v })}
				/>
				<NumberField
					label="Angle"
					value={angle}
					unit="°"
					min={1}
					max={360}
					step={5}
					onChange={(v) => onUpdate({ angle: v })}
				/>
				{angle < 360 && (
					<div className="text-[9px] text-yellow-500 leading-snug">
						Partial revolves are not yet supported by the replicad kernel —
						anything &lt; 360° will fall back to a full revolve.
					</div>
				)}
			</Section>

			<Section title="Result">
				<div className="text-[10px] text-gray-500 leading-snug">
					{isCut
						? "Cut removes a revolved volume from the current solid."
						: "Boss creates a revolved solid or fuses it into the current solid."}
				</div>
			</Section>
		</>
	);
}

function FilletEditor({
	feature,
	onUpdate,
}: {
	feature: Feature;
	onUpdate: (u: Record<string, unknown>) => void;
}) {
	const p = feature.params as Record<string, unknown>;
	return (
		<Section title="Fillet Parameters">
			<NumberField
				label="Radius"
				value={(p.radius as number) ?? 2}
				unit="mm"
				min={0.01}
				step={0.5}
				onChange={(v) => onUpdate({ radius: v })}
			/>
			<div className="text-[9px] text-gray-500 leading-snug">
				Applies to all edges of the current solid. Face/edge selection is not
				yet supported — use custom code in the editor for targeted filleting.
			</div>
		</Section>
	);
}

function ChamferEditor({
	feature,
	onUpdate,
}: {
	feature: Feature;
	onUpdate: (u: Record<string, unknown>) => void;
}) {
	const p = feature.params as Record<string, unknown>;
	return (
		<Section title="Chamfer Parameters">
			<NumberField
				label="Distance"
				value={(p.distance as number) ?? 1}
				unit="mm"
				min={0.01}
				step={0.5}
				onChange={(v) => onUpdate({ distance: v })}
			/>
		</Section>
	);
}

function ShellEditor({
	feature,
	onUpdate,
}: {
	feature: Feature;
	onUpdate: (u: Record<string, unknown>) => void;
}) {
	const p = feature.params as Record<string, unknown>;
	return (
		<Section title="Shell Parameters">
			<NumberField
				label="Thickness"
				value={(p.thickness as number) ?? 2}
				unit="mm"
				min={0.1}
				step={0.5}
				onChange={(v) => onUpdate({ thickness: v })}
			/>
		</Section>
	);
}

function MirrorEditor({
	feature,
	onUpdate,
}: {
	feature: Feature;
	onUpdate: (u: Record<string, unknown>) => void;
}) {
	const p = feature.params as Record<string, unknown>;
	return (
		<Section title="Mirror Parameters">
			<SelectField
				label="Mirror plane"
				value={(p.plane as string) || "XY"}
				options={[
					{ label: "Front (XZ)", value: "XZ" },
					{ label: "Top (XY)", value: "XY" },
					{ label: "Right (YZ)", value: "YZ" },
				]}
				onChange={(v) => onUpdate({ plane: v as SketchPlane })}
			/>
		</Section>
	);
}

function PatternEditor({
	feature,
	onUpdate,
}: {
	feature: Feature;
	onUpdate: (u: Record<string, unknown>) => void;
}) {
	const p = feature.params as Record<string, unknown>;
	return (
		<Section title="Linear Pattern">
			<SelectField
				label="Axis"
				value={(p.axis as string) || "X"}
				options={[
					{ label: "X Axis", value: "X" },
					{ label: "Y Axis", value: "Y" },
					{ label: "Z Axis", value: "Z" },
				]}
				onChange={(v) => onUpdate({ axis: v })}
			/>
			<NumberField
				label="Count"
				value={(p.count as number) ?? 4}
				min={2}
				max={100}
				step={1}
				onChange={(v) => onUpdate({ count: Math.round(v) })}
			/>
			<NumberField
				label="Spacing"
				value={(p.spacing as number) ?? 20}
				unit="mm"
				min={0}
				step={1}
				onChange={(v) => onUpdate({ spacing: v })}
			/>
		</Section>
	);
}

function SketchSummary({ feature }: { feature: Feature }) {
	const data = feature.sketchData;
	return (
		<Section title="Sketch">
			<div className="text-[11px] text-gray-300">
				Plane:{" "}
				<span className="text-forge-400">
					{(feature.params as { plane?: string }).plane ?? data?.plane ?? "—"}
				</span>
			</div>
			<div className="text-[11px] text-gray-300">
				Entities: {data?.entities.length ?? 0}
			</div>
			<div className="text-[11px] text-gray-300">
				Constraints: {data?.constraints.length ?? 0}
			</div>
			<div className="text-[10px] text-gray-500 leading-snug pt-1">
				Double-click the sketch in the feature tree to re-enter sketch mode and
				edit entities.
			</div>
		</Section>
	);
}

function GenericEditor({
	feature,
	onUpdate,
}: {
	feature: Feature;
	onUpdate: (u: Record<string, unknown>) => void;
}) {
	const entries = Object.entries(feature.params);
	return (
		<Section title={`${feature.type} parameters`}>
			{entries.length === 0 && (
				<div className="text-[10px] text-gray-500">No parameters.</div>
			)}
			{entries.map(([key, val]) => {
				if (typeof val === "number") {
					return (
						<NumberField
							key={key}
							label={key}
							value={val}
							onChange={(v) => onUpdate({ [key]: v })}
						/>
					);
				}
				return (
					<div key={key} className="text-[10px] text-gray-500">
						{key}: {String(val)}
					</div>
				);
			})}
		</Section>
	);
}
