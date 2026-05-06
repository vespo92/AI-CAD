import { useCadEngine } from "@/hooks/use-cad-engine";
import { generateCodeFromFeatures } from "@/lib/cad-engine/feature-codegen";
import { useCadStore } from "@/lib/store/cad-store";
import { cn } from "@/lib/utils/cn";
import type { Feature, FeatureType, SketchPlane } from "@/types/cad";
import {
	CubeIcon,
	EyeIcon,
	EyeSlashIcon,
	PencilSquareIcon,
	TrashIcon,
} from "@heroicons/react/24/outline";
import { useCallback } from "react";

const FEATURE_ICONS: Partial<Record<FeatureType, string>> = {
	origin: "\u2295",
	plane: "\u25AD",
	sketch: "S",
	extrude: "E",
	"extrude-cut": "E-",
	revolve: "R",
	"revolve-cut": "R-",
	sweep: "W",
	loft: "L",
	fillet: "F",
	chamfer: "C",
	"boolean-fuse": "+",
	"boolean-cut": "-",
	"boolean-common": "&",
	shell: "H",
	mirror: "M",
	pattern: "P",
};

const FEATURE_COLORS: Partial<Record<FeatureType, string>> = {
	origin: "bg-gray-700/40 text-gray-300",
	plane: "bg-slate-600/30 text-slate-300",
	sketch: "bg-blue-500/20 text-blue-400",
	extrude: "bg-green-500/20 text-green-400",
	"extrude-cut": "bg-red-500/20 text-red-400",
	revolve: "bg-purple-500/20 text-purple-400",
	"revolve-cut": "bg-fuchsia-500/20 text-fuchsia-400",
	sweep: "bg-yellow-500/20 text-yellow-400",
	loft: "bg-pink-500/20 text-pink-400",
	fillet: "bg-cyan-500/20 text-cyan-400",
	chamfer: "bg-orange-500/20 text-orange-400",
	"boolean-fuse": "bg-emerald-500/20 text-emerald-400",
	"boolean-cut": "bg-red-500/20 text-red-400",
	"boolean-common": "bg-indigo-500/20 text-indigo-400",
	shell: "bg-teal-500/20 text-teal-400",
	mirror: "bg-violet-500/20 text-violet-400",
	pattern: "bg-amber-500/20 text-amber-400",
};

interface FeatureTreeProps {
	className?: string;
}

export function FeatureTree({ className }: FeatureTreeProps) {
	const model = useCadStore((s) => s.model);
	const selectedFeatureId = useCadStore((s) => s.selectedFeatureId);
	const selectFeature = useCadStore((s) => s.selectFeature);
	const toggleVisibility = useCadStore((s) => s.toggleFeatureVisibility);
	const removeFeature = useCadStore((s) => s.removeFeature);
	const setEditorCode = useCadStore((s) => s.setEditorCode);
	const pushHistory = useCadStore((s) => s.pushHistory);
	const openPropertyManager = useCadStore((s) => s.openPropertyManager);
	const sketchWorkflow = useCadStore((s) => s.sketchWorkflow);
	const pickSketchPlane = useCadStore((s) => s.pickSketchPlane);
	const cancelSketchWorkflow = useCadStore((s) => s.cancelSketchWorkflow);
	const { execute } = useCadEngine();

	const rebuildFromFeatures = useCallback(
		async (features: Feature[]) => {
			const code = generateCodeFromFeatures(features);
			setEditorCode(code);
			pushHistory("Feature tree update");
			await execute(code);
		},
		[setEditorCode, pushHistory, execute],
	);

	const handleDeleteFeature = useCallback(
		async (id: string) => {
			const feat = useCadStore
				.getState()
				.model.features.find((f) => f.id === id);
			if (feat?.structural) return;
			removeFeature(id);
			const updatedFeatures = useCadStore.getState().model.features;
			await rebuildFromFeatures(updatedFeatures);
		},
		[removeFeature, rebuildFromFeatures],
	);

	const handleToggleVisibility = useCallback(
		async (id: string) => {
			toggleVisibility(id);
			const updatedFeatures = useCadStore.getState().model.features;
			await rebuildFromFeatures(updatedFeatures);
		},
		[toggleVisibility, rebuildFromFeatures],
	);

	const handleFeatureClick = useCallback(
		(feature: Feature) => {
			selectFeature(feature.id);

			// If we're in plane-picking mode and user clicked a plane, start the sketch
			if (
				sketchWorkflow.stage === "picking-plane" &&
				feature.type === "plane"
			) {
				const plane = (feature.params as { plane?: SketchPlane }).plane;
				if (plane) {
					pickSketchPlane(plane, feature.id);
				}
				return;
			}

			// Double-click to edit feature properties (handled separately below)
		},
		[selectFeature, sketchWorkflow.stage, pickSketchPlane],
	);

	const handleEditFeature = useCallback(
		(feature: Feature) => {
			if (feature.structural) return;
			if (feature.type === "sketch") {
				// Re-enter sketch mode for this sketch
				const plane = (feature.params as { plane?: SketchPlane }).plane;
				if (plane) {
					useCadStore.setState({
						sketchWorkflow: {
							stage: "editing",
							plane,
							featureId: feature.id,
						},
						viewMode: "sketch",
					});
				}
				return;
			}
			openPropertyManager(feature.id, false);
		},
		[openPropertyManager],
	);

	// Separate structural entries (Origin + default planes) from the feature list
	const structural = model.features.filter((f) => f.structural);
	const features = model.features.filter((f) => !f.structural);

	return (
		<div className={cn("flex flex-col", className)}>
			{/* Header */}
			<div className="flex items-center justify-between px-3 py-2 border-b border-gray-700">
				<div className="flex items-center gap-2">
					<CubeIcon className="w-4 h-4 text-forge-500" />
					<span className="text-sm font-medium text-gray-200">
						{model.name}
					</span>
				</div>
				<button
					type="button"
					className="p-1 text-gray-400 hover:text-gray-200 rounded"
					title="Rename model"
				>
					<PencilSquareIcon className="w-3.5 h-3.5" />
				</button>
			</div>

			{/* Plane-picking banner */}
			{sketchWorkflow.stage === "picking-plane" && (
				<div className="px-3 py-2 bg-forge-500/10 border-b border-forge-500/30 text-[11px] text-forge-300 flex items-center justify-between">
					<span>Pick a plane for the new sketch</span>
					<button
						type="button"
						onClick={cancelSketchWorkflow}
						className="text-[10px] text-gray-400 hover:text-gray-200"
					>
						Cancel
					</button>
				</div>
			)}

			{/* Feature list */}
			<div className="flex-1 overflow-y-auto py-1">
				{/* Structural section: Origin + default planes */}
				<div className="px-2 pt-1 pb-0.5 text-[9px] font-semibold text-gray-600 uppercase tracking-wider">
					Reference
				</div>
				{structural.map((feature, index) => (
					<FeatureItem
						key={feature.id}
						feature={feature}
						index={index}
						isSelected={feature.id === selectedFeatureId}
						isPickable={
							sketchWorkflow.stage === "picking-plane" &&
							feature.type === "plane"
						}
						onSelect={() => handleFeatureClick(feature)}
						onEdit={() => handleEditFeature(feature)}
						onToggleVisibility={() => handleToggleVisibility(feature.id)}
						onDelete={() => handleDeleteFeature(feature.id)}
					/>
				))}

				<div className="px-2 pt-3 pb-0.5 text-[9px] font-semibold text-gray-600 uppercase tracking-wider">
					Features
				</div>
				{features.length === 0 ? (
					<div className="px-3 py-4 text-center">
						<p className="text-[11px] text-gray-500">No features yet</p>
						<p className="text-[10px] text-gray-600 mt-1">
							Use the ribbon above to add a Sketch, Extrude, or other feature.
						</p>
					</div>
				) : (
					features.map((feature, index) => (
						<FeatureItem
							key={feature.id}
							feature={feature}
							index={index + structural.length}
							isSelected={feature.id === selectedFeatureId}
							isPickable={false}
							onSelect={() => handleFeatureClick(feature)}
							onEdit={() => handleEditFeature(feature)}
							onToggleVisibility={() => handleToggleVisibility(feature.id)}
							onDelete={() => handleDeleteFeature(feature.id)}
						/>
					))
				)}
			</div>

			{/* Footer stats */}
			<div className="px-3 py-2 border-t border-gray-700 text-xs text-gray-500 flex justify-between">
				<span>
					{features.length} feature{features.length !== 1 ? "s" : ""}
				</span>
				{features.length > 0 && (
					<span>
						{features.filter((f) => f.visible && !f.suppressed).length} active
					</span>
				)}
			</div>
		</div>
	);
}

function FeatureItem({
	feature,
	index,
	isSelected,
	isPickable,
	onSelect,
	onEdit,
	onToggleVisibility,
	onDelete,
}: {
	feature: Feature;
	index: number;
	isSelected: boolean;
	isPickable: boolean;
	onSelect: () => void;
	onEdit: () => void;
	onToggleVisibility: () => void;
	onDelete: () => void;
}) {
	return (
		<button
			type="button"
			className={cn(
				"group flex items-center gap-2 px-3 py-1.5 cursor-pointer transition-colors w-full text-left",
				isSelected
					? "bg-forge-600/20 border-l-2 border-forge-500"
					: "hover:bg-gray-800/50 border-l-2 border-transparent",
				feature.suppressed && "opacity-50",
				isPickable && "ring-1 ring-forge-500/40 bg-forge-500/5",
			)}
			onClick={onSelect}
			onDoubleClick={onEdit}
		>
			{/* Feature type icon */}
			<span
				className={cn(
					"w-5 h-5 rounded text-xs font-mono flex items-center justify-center flex-shrink-0",
					FEATURE_COLORS[feature.type] || "bg-gray-700/40 text-gray-400",
				)}
			>
				{FEATURE_ICONS[feature.type] || "?"}
			</span>

			{/* Feature name */}
			<span className="flex-1 text-sm text-gray-300 truncate">
				{!feature.structural && (
					<span className="text-gray-500 mr-1">{index + 1}.</span>
				)}
				{feature.name}
			</span>

			{/* Actions (visible on hover) */}
			<div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
				{!feature.structural && (
					<button
						type="button"
						onClick={(e) => {
							e.stopPropagation();
							onEdit();
						}}
						className="p-0.5 text-gray-500 hover:text-forge-400 rounded"
						title="Edit properties"
					>
						<PencilSquareIcon className="w-3.5 h-3.5" />
					</button>
				)}
				<button
					type="button"
					onClick={(e) => {
						e.stopPropagation();
						onToggleVisibility();
					}}
					className="p-0.5 text-gray-500 hover:text-gray-300 rounded"
					title={feature.visible ? "Hide" : "Show"}
				>
					{feature.visible ? (
						<EyeIcon className="w-3.5 h-3.5" />
					) : (
						<EyeSlashIcon className="w-3.5 h-3.5" />
					)}
				</button>
				{!feature.structural && (
					<button
						type="button"
						onClick={(e) => {
							e.stopPropagation();
							onDelete();
						}}
						className="p-0.5 text-gray-500 hover:text-red-400 rounded"
						title="Delete feature"
					>
						<TrashIcon className="w-3.5 h-3.5" />
					</button>
				)}
			</div>
		</button>
	);
}
