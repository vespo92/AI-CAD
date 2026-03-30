import { useCadEngine } from "@/hooks/use-cad-engine";
import {
	createDefaultFeature,
	generateCodeFromFeatures,
} from "@/lib/cad-engine/feature-codegen";
import { useCadStore } from "@/lib/store/cad-store";
import { cn } from "@/lib/utils/cn";
import type { Feature, FeatureType } from "@/types/cad";
import {
	CubeIcon,
	EyeIcon,
	EyeSlashIcon,
	PencilSquareIcon,
	PlusIcon,
	TrashIcon,
} from "@heroicons/react/24/outline";
import { useCallback, useState } from "react";

const FEATURE_ICONS: Record<FeatureType, string> = {
	sketch: "S",
	extrude: "E",
	revolve: "R",
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

const FEATURE_COLORS: Record<FeatureType, string> = {
	sketch: "bg-blue-500/20 text-blue-400",
	extrude: "bg-green-500/20 text-green-400",
	revolve: "bg-purple-500/20 text-purple-400",
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

const ADD_FEATURE_MENU: { label: string; type: FeatureType }[] = [
	{ label: "Sketch", type: "sketch" },
	{ label: "Extrude", type: "extrude" },
	{ label: "Revolve", type: "revolve" },
	{ label: "Fillet", type: "fillet" },
	{ label: "Chamfer", type: "chamfer" },
	{ label: "Shell", type: "shell" },
	{ label: "Boolean Cut", type: "boolean-cut" },
	{ label: "Boolean Fuse", type: "boolean-fuse" },
	{ label: "Mirror", type: "mirror" },
	{ label: "Pattern", type: "pattern" },
];

interface FeatureTreeProps {
	className?: string;
}

export function FeatureTree({ className }: FeatureTreeProps) {
	const model = useCadStore((s) => s.model);
	const selectedFeatureId = useCadStore((s) => s.selectedFeatureId);
	const selectFeature = useCadStore((s) => s.selectFeature);
	const toggleVisibility = useCadStore((s) => s.toggleFeatureVisibility);
	const removeFeature = useCadStore((s) => s.removeFeature);
	const addFeature = useCadStore((s) => s.addFeature);
	const setEditorCode = useCadStore((s) => s.setEditorCode);
	const pushHistory = useCadStore((s) => s.pushHistory);
	const { execute } = useCadEngine();
	const [showAddMenu, setShowAddMenu] = useState(false);

	const rebuildFromFeatures = useCallback(
		async (features: Feature[]) => {
			const code = generateCodeFromFeatures(features);
			setEditorCode(code);
			pushHistory("Feature tree update");
			await execute(code);
		},
		[setEditorCode, pushHistory, execute],
	);

	const handleAddFeature = useCallback(
		async (type: FeatureType) => {
			const feature = createDefaultFeature(type);
			addFeature(feature);
			setShowAddMenu(false);

			// Rebuild model from features
			const updatedFeatures = [...useCadStore.getState().model.features];
			await rebuildFromFeatures(updatedFeatures);
		},
		[addFeature, rebuildFromFeatures],
	);

	const handleDeleteFeature = useCallback(
		async (id: string) => {
			removeFeature(id);
			const updatedFeatures = useCadStore
				.getState()
				.model.features.filter((f) => f.id !== id);
			if (updatedFeatures.length > 0) {
				await rebuildFromFeatures(updatedFeatures);
			}
		},
		[removeFeature, rebuildFromFeatures],
	);

	const handleToggleVisibility = useCallback(
		async (id: string) => {
			toggleVisibility(id);
			const updatedFeatures = useCadStore
				.getState()
				.model.features.map((f) =>
					f.id === id ? { ...f, visible: !f.visible } : f,
				);
			await rebuildFromFeatures(updatedFeatures);
		},
		[toggleVisibility, rebuildFromFeatures],
	);

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
				<div className="flex items-center gap-1">
					<button
						type="button"
						className="p-1 text-gray-400 hover:text-gray-200 rounded"
						title="Rename model"
					>
						<PencilSquareIcon className="w-3.5 h-3.5" />
					</button>
					<div className="relative">
						<button
							type="button"
							className="p-1 text-forge-400 hover:text-forge-300 rounded"
							title="Add feature"
							onClick={() => setShowAddMenu(!showAddMenu)}
						>
							<PlusIcon className="w-3.5 h-3.5" />
						</button>
						{showAddMenu && (
							<div className="absolute right-0 top-full mt-1 w-40 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50 py-1">
								{ADD_FEATURE_MENU.map((item) => (
									<button
										key={item.type}
										type="button"
										className="w-full text-left px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-700 flex items-center gap-2"
										onClick={() => handleAddFeature(item.type)}
									>
										<span
											className={cn(
												"w-4 h-4 rounded text-[9px] font-mono flex items-center justify-center flex-shrink-0",
												FEATURE_COLORS[item.type],
											)}
										>
											{FEATURE_ICONS[item.type]}
										</span>
										{item.label}
									</button>
								))}
							</div>
						)}
					</div>
				</div>
			</div>

			{/* Feature list */}
			<div className="flex-1 overflow-y-auto py-1">
				{model.features.length === 0 ? (
					<div className="px-3 py-6 text-center">
						<p className="text-sm text-gray-500">No features yet</p>
						<p className="text-xs text-gray-600 mt-1">
							Click + to add a feature, or use the chat/code editor
						</p>
					</div>
				) : (
					model.features.map((feature, index) => (
						<FeatureItem
							key={feature.id}
							feature={feature}
							index={index}
							isSelected={feature.id === selectedFeatureId}
							onSelect={() => selectFeature(feature.id)}
							onToggleVisibility={() => handleToggleVisibility(feature.id)}
							onDelete={() => handleDeleteFeature(feature.id)}
						/>
					))
				)}
			</div>

			{/* Footer stats */}
			<div className="px-3 py-2 border-t border-gray-700 text-xs text-gray-500 flex justify-between">
				<span>
					{model.features.length} feature
					{model.features.length !== 1 ? "s" : ""}
				</span>
				{model.features.length > 0 && (
					<span>
						{model.features.filter((f) => f.visible && !f.suppressed).length}{" "}
						active
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
	onSelect,
	onToggleVisibility,
	onDelete,
}: {
	feature: Feature;
	index: number;
	isSelected: boolean;
	onSelect: () => void;
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
			)}
			onClick={onSelect}
		>
			{/* Feature type icon */}
			<span
				className={cn(
					"w-5 h-5 rounded text-xs font-mono flex items-center justify-center flex-shrink-0",
					FEATURE_COLORS[feature.type],
				)}
			>
				{FEATURE_ICONS[feature.type]}
			</span>

			{/* Feature name */}
			<span className="flex-1 text-sm text-gray-300 truncate">
				<span className="text-gray-500 mr-1">{index + 1}.</span>
				{feature.name}
			</span>

			{/* Actions (visible on hover) */}
			<div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
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
			</div>
		</button>
	);
}
