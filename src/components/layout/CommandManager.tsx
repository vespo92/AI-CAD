/**
 * CommandManager — SolidWorks-style feature ribbon
 *
 * Sits between the top Toolbar and the main workspace. Provides big, grouped,
 * labeled buttons for the core part-modeling workflow:
 *   Sketch       → starts the pick-a-plane sketch workflow
 *   Extruded Boss / Cut, Revolved Boss / Cut, Sweep, Loft
 *   Fillet, Chamfer, Shell
 *   Mirror, Pattern
 *   Macros       → jumps to the macros panel
 *
 * Each feature button either opens the sketch workflow or inserts a feature
 * with defaults and opens the PropertyManager for editing.
 */

import { useCadEngine } from "@/hooks/use-cad-engine";
import { generateCodeFromFeatures } from "@/lib/cad-engine/feature-codegen";
import { useCadStore } from "@/lib/store/cad-store";
import { cn } from "@/lib/utils/cn";
import type { FeatureType } from "@/types/cad";

interface RibbonButton {
	label: string;
	icon: string;
	/** Which feature to insert; omit to run a custom onClick */
	featureType?: FeatureType;
	onClick?: () => void;
	disabled?: boolean;
	tooltip: string;
	/** Primary buttons get larger styling */
	primary?: boolean;
	/** Requires a sketch to already exist */
	requiresSketch?: boolean;
	/** Requires a solid (non-sketch feature with geometry) */
	requiresSolid?: boolean;
}

interface RibbonGroup {
	title: string;
	buttons: RibbonButton[];
}

export function CommandManager() {
	const beginSketchWorkflow = useCadStore((s) => s.beginSketchWorkflow);
	const insertFeature = useCadStore((s) => s.insertFeature);
	const setActiveLeftTab = useCadStore((s) => s.setActiveLeftTab);
	const sketchWorkflow = useCadStore((s) => s.sketchWorkflow);
	const features = useCadStore((s) => s.model.features);
	const setEditorCode = useCadStore((s) => s.setEditorCode);
	const { execute } = useCadEngine();

	const hasSketch = features.some((f) => f.type === "sketch");
	const hasSolid = features.some(
		(f) =>
			f.type !== "sketch" &&
			f.type !== "plane" &&
			f.type !== "origin" &&
			!f.suppressed &&
			f.visible,
	);
	const inSketchMode = sketchWorkflow.stage !== "idle";

	const handleInsert = (type: FeatureType) => {
		insertFeature(type, true);
		// Kick a rebuild once the feature is added so preview updates
		const updated = useCadStore.getState().model.features;
		const code = generateCodeFromFeatures(updated);
		setEditorCode(code);
		execute(code);
	};

	const groups: RibbonGroup[] = [
		{
			title: "Sketch",
			buttons: [
				{
					label: "New Sketch",
					icon: "✎",
					primary: true,
					tooltip:
						"Start a new sketch — pick a plane in the feature tree, then draw entities",
					onClick: beginSketchWorkflow,
					disabled: inSketchMode,
				},
			],
		},
		{
			title: "Features",
			buttons: [
				{
					label: "Extruded Boss",
					icon: "⬆",
					primary: true,
					featureType: "extrude",
					requiresSketch: true,
					tooltip:
						"Extrude a sketch into a 3D solid (adds material). Configure depth and direction in the PropertyManager.",
				},
				{
					label: "Extruded Cut",
					icon: "⬇",
					featureType: "extrude-cut",
					requiresSketch: true,
					requiresSolid: true,
					tooltip: "Extrude a sketch and subtract it from the current solid",
				},
				{
					label: "Revolved Boss",
					icon: "⟳",
					primary: true,
					featureType: "revolve",
					requiresSketch: true,
					tooltip:
						"Revolve a sketch around an axis. Configure axis and angle in the PropertyManager.",
				},
				{
					label: "Revolved Cut",
					icon: "⟲",
					featureType: "revolve-cut",
					requiresSketch: true,
					requiresSolid: true,
					tooltip: "Revolve a sketch and subtract the result from the solid",
				},
			],
		},
		{
			title: "Modify",
			buttons: [
				{
					label: "Fillet",
					icon: "◜",
					featureType: "fillet",
					requiresSolid: true,
					tooltip: "Round edges of the current solid",
				},
				{
					label: "Chamfer",
					icon: "◺",
					featureType: "chamfer",
					requiresSolid: true,
					tooltip: "Bevel edges of the current solid",
				},
				{
					label: "Shell",
					icon: "◌",
					featureType: "shell",
					requiresSolid: true,
					tooltip: "Hollow out the solid with a uniform wall thickness",
				},
			],
		},
		{
			title: "Pattern",
			buttons: [
				{
					label: "Mirror",
					icon: "⇆",
					featureType: "mirror",
					requiresSolid: true,
					tooltip: "Mirror the current solid across a plane",
				},
				{
					label: "Linear Pattern",
					icon: "⋮⋮",
					featureType: "pattern",
					requiresSolid: true,
					tooltip: "Repeat the current solid along an axis",
				},
			],
		},
		{
			title: "Tools",
			buttons: [
				{
					label: "Macros",
					icon: "⚡",
					tooltip: "Open the macros panel to run or record a macro",
					onClick: () => setActiveLeftTab("macros"),
				},
			],
		},
	];

	return (
		<div className="flex items-stretch gap-0 h-20 bg-gray-850 border-b border-gray-700 overflow-x-auto overflow-y-hidden">
			{groups.map((group, i) => (
				<div
					key={group.title}
					className={cn(
						"flex flex-col items-center px-2 py-1 min-w-fit",
						i > 0 && "border-l border-gray-700/60",
					)}
				>
					<div className="flex items-end gap-0.5 flex-1 min-h-0">
						{group.buttons.map((btn) => {
							const disabled =
								btn.disabled ||
								(btn.requiresSketch && !hasSketch) ||
								(btn.requiresSolid && !hasSolid);
							return (
								<RibbonButtonComponent
									key={btn.label}
									button={btn}
									disabled={disabled}
									onClick={() => {
										if (btn.onClick) {
											btn.onClick();
										} else if (btn.featureType) {
											handleInsert(btn.featureType);
										}
									}}
								/>
							);
						})}
					</div>
					<div className="text-[9px] uppercase tracking-wider text-gray-600 mt-0.5 font-semibold">
						{group.title}
					</div>
				</div>
			))}
		</div>
	);
}

function RibbonButtonComponent({
	button,
	disabled,
	onClick,
}: {
	button: RibbonButton;
	disabled?: boolean;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			disabled={disabled}
			onClick={onClick}
			className={cn(
				"flex flex-col items-center justify-start gap-0.5 px-2 rounded transition-colors",
				button.primary ? "py-1 min-w-[60px]" : "py-1 min-w-[52px]",
				disabled
					? "opacity-30 cursor-not-allowed"
					: "hover:bg-gray-800 text-gray-300 hover:text-forge-400",
			)}
			title={button.tooltip}
		>
			<span
				className={cn(button.primary ? "text-2xl" : "text-xl", "leading-none")}
			>
				{button.icon}
			</span>
			<span
				className={cn(
					"leading-tight text-center",
					button.primary ? "text-[10px]" : "text-[9px]",
				)}
			>
				{button.label}
			</span>
		</button>
	);
}
