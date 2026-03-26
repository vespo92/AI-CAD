import { useCadStore } from "@/lib/store/cad-store";
import { cn } from "@/lib/utils/cn";
import type { AssemblyPart, Mate, MateType } from "@/types/cad";
import {
	CubeTransparentIcon,
	LinkIcon,
	PlusIcon,
	TrashIcon,
} from "@heroicons/react/24/outline";

interface AssemblyPanelProps {
	className?: string;
}

const MATE_ICONS: Record<MateType, string> = {
	coincident: "=",
	concentric: "O",
	distance: "D",
	angle: "A",
	tangent: "T",
	lock: "L",
	gear: "G",
	"rack-pinion": "R",
};

export function AssemblyPanel({ className }: AssemblyPanelProps) {
	const assembly = useCadStore((s) => s.assembly);
	const addPart = useCadStore((s) => s.addAssemblyPart);
	const removePart = useCadStore((s) => s.removeAssemblyPart);
	const removeMate = useCadStore((s) => s.removeMate);

	const handleAddPart = () => {
		const part: AssemblyPart = {
			id: crypto.randomUUID(),
			name: `Part ${assembly.parts.length + 1}`,
			modelId: "",
			transform: {
				position: { x: 0, y: 0, z: 0 },
				rotation: { x: 0, y: 0, z: 0 },
			},
			visible: true,
		};
		addPart(part);
	};

	return (
		<div className={cn("flex flex-col", className)}>
			{/* Header */}
			<div className="flex items-center justify-between px-3 py-2 border-b border-gray-700">
				<div className="flex items-center gap-2">
					<CubeTransparentIcon className="w-4 h-4 text-forge-500" />
					<span className="text-sm font-medium text-gray-200">
						{assembly.name}
					</span>
				</div>
				<button
					type="button"
					onClick={handleAddPart}
					className="p-1 text-gray-400 hover:text-gray-200 rounded hover:bg-gray-800"
					title="Add part"
				>
					<PlusIcon className="w-3.5 h-3.5" />
				</button>
			</div>

			<div className="flex-1 overflow-y-auto">
				{/* Parts section */}
				<div className="px-3 py-1.5">
					<h3 className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">
						Parts ({assembly.parts.length})
					</h3>
					{assembly.parts.length === 0 ? (
						<p className="text-xs text-gray-600 py-2">
							No parts in assembly. Add parts from the Part Library.
						</p>
					) : (
						assembly.parts.map((part) => (
							<PartItem
								key={part.id}
								part={part}
								onRemove={() => removePart(part.id)}
							/>
						))
					)}
				</div>

				{/* Mates section */}
				<div className="px-3 py-1.5 border-t border-gray-700">
					<h3 className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">
						Mates ({assembly.mates.length})
					</h3>
					{assembly.mates.length === 0 ? (
						<p className="text-xs text-gray-600 py-2">
							No mates defined. Select two faces in the viewport to create a
							mate.
						</p>
					) : (
						assembly.mates.map((mate) => (
							<MateItem
								key={mate.id}
								mate={mate}
								parts={assembly.parts}
								onRemove={() => removeMate(mate.id)}
							/>
						))
					)}
				</div>
			</div>

			{/* Footer */}
			<div className="px-3 py-2 border-t border-gray-700 text-[10px] text-gray-600">
				{assembly.parts.length} parts, {assembly.mates.length} mates
			</div>
		</div>
	);
}

function PartItem({
	part,
	onRemove,
}: { part: AssemblyPart; onRemove: () => void }) {
	return (
		<div className="group flex items-center gap-2 py-1 hover:bg-gray-800/30 rounded px-1">
			<CubeTransparentIcon className="w-3.5 h-3.5 text-gray-500" />
			<span className="flex-1 text-xs text-gray-300 truncate">{part.name}</span>
			{part.color && (
				<span
					className="w-2.5 h-2.5 rounded-full"
					style={{ backgroundColor: part.color }}
				/>
			)}
			<button
				type="button"
				onClick={onRemove}
				className="opacity-0 group-hover:opacity-100 p-0.5 text-gray-500 hover:text-red-400"
				title="Remove part"
			>
				<TrashIcon className="w-3 h-3" />
			</button>
		</div>
	);
}

function MateItem({
	mate,
	parts,
	onRemove,
}: { mate: Mate; parts: AssemblyPart[]; onRemove: () => void }) {
	const partA = parts.find((p) => p.id === mate.partA);
	const partB = parts.find((p) => p.id === mate.partB);

	return (
		<div className="group flex items-center gap-2 py-1 hover:bg-gray-800/30 rounded px-1">
			<span className="w-4 h-4 rounded bg-gray-700 text-[9px] font-mono flex items-center justify-center text-gray-400">
				{MATE_ICONS[mate.type]}
			</span>
			<div className="flex-1 min-w-0">
				<div className="flex items-center gap-1 text-[10px] text-gray-400">
					<span className="truncate">{partA?.name || "?"}</span>
					<LinkIcon className="w-2.5 h-2.5 text-gray-600 flex-shrink-0" />
					<span className="truncate">{partB?.name || "?"}</span>
				</div>
			</div>
			{mate.locked && (
				<span className="text-[9px] text-yellow-600">locked</span>
			)}
			<button
				type="button"
				onClick={onRemove}
				className="opacity-0 group-hover:opacity-100 p-0.5 text-gray-500 hover:text-red-400"
				title="Remove mate"
			>
				<TrashIcon className="w-3 h-3" />
			</button>
		</div>
	);
}
