import { useCadEngine } from "@/hooks/use-cad-engine";
import { BUILTIN_PARTS, getBuiltinCategories } from "@/lib/api/upc-client";
import { useCadStore } from "@/lib/store/cad-store";
import { cn } from "@/lib/utils/cn";
import type { PartLibraryItem } from "@/types/cad";
import {
	MagnifyingGlassIcon,
	PlusIcon,
	SparklesIcon,
} from "@heroicons/react/24/outline";
import { useCallback, useMemo, useState } from "react";

interface PartLibraryProps {
	className?: string;
}

const CONSCIOUSNESS_COLORS: Record<string, string> = {
	dormant: "text-gray-500",
	reactive: "text-yellow-500",
	aware: "text-blue-400",
	reflective: "text-purple-400",
	meta_aware: "text-cyan-400",
	transcendent: "text-forge-400",
};

export function PartLibrary({ className }: PartLibraryProps) {
	const [search, setSearch] = useState("");
	const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
	const categories = useMemo(() => getBuiltinCategories(), []);

	const filteredParts = useMemo(() => {
		let parts = BUILTIN_PARTS;
		if (selectedCategory) {
			parts = parts.filter((p) => p.category === selectedCategory);
		}
		if (search.trim()) {
			const q = search.toLowerCase();
			parts = parts.filter(
				(p) =>
					p.name.toLowerCase().includes(q) ||
					p.description.toLowerCase().includes(q) ||
					p.tags.some((t) => t.toLowerCase().includes(q)),
			);
		}
		return parts;
	}, [search, selectedCategory]);

	return (
		<div className={cn("flex flex-col", className)}>
			{/* Header */}
			<div className="px-3 py-2 border-b border-gray-700">
				<div className="flex items-center gap-2 mb-2">
					<SparklesIcon className="w-4 h-4 text-forge-500" />
					<span className="text-sm font-medium text-gray-200">
						Part Library
					</span>
					<span className="text-[10px] text-gray-600 ml-auto">UPC</span>
				</div>

				{/* Search */}
				<div className="relative">
					<MagnifyingGlassIcon className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
					<input
						type="text"
						value={search}
						onChange={(e) => setSearch(e.target.value)}
						placeholder="Search parts..."
						className="input w-full pl-7 py-1 text-xs"
					/>
				</div>
			</div>

			{/* Categories */}
			<div className="flex gap-1 px-3 py-1.5 flex-wrap border-b border-gray-700">
				<button
					type="button"
					onClick={() => setSelectedCategory(null)}
					className={cn(
						"px-2 py-0.5 text-[10px] rounded-full transition-colors",
						!selectedCategory
							? "bg-forge-600/30 text-forge-400"
							: "bg-gray-800 text-gray-500 hover:text-gray-300",
					)}
				>
					All
				</button>
				{categories.map((cat) => (
					<button
						key={cat}
						type="button"
						onClick={() =>
							setSelectedCategory(cat === selectedCategory ? null : cat)
						}
						className={cn(
							"px-2 py-0.5 text-[10px] rounded-full transition-colors",
							cat === selectedCategory
								? "bg-forge-600/30 text-forge-400"
								: "bg-gray-800 text-gray-500 hover:text-gray-300",
						)}
					>
						{cat}
					</button>
				))}
			</div>

			{/* Parts list */}
			<div className="flex-1 overflow-y-auto py-1">
				{filteredParts.length === 0 ? (
					<div className="px-3 py-6 text-center">
						<p className="text-sm text-gray-500">No parts found</p>
						<p className="text-xs text-gray-600 mt-1">
							Try a different search or category
						</p>
					</div>
				) : (
					filteredParts.map((part) => <PartCard key={part.id} part={part} />)
				)}
			</div>

			{/* Footer */}
			<div className="px-3 py-1.5 border-t border-gray-700 text-[10px] text-gray-600">
				{filteredParts.length} parts
				{!import.meta.env.VITE_UPC_BASE_URL && " (offline library)"}
			</div>
		</div>
	);
}

function PartCard({ part }: { part: PartLibraryItem }) {
	const setEditorCode = useCadStore((s) => s.setEditorCode);
	const setActiveBottomTab = useCadStore((s) => s.setActiveBottomTab);
	const pushHistory = useCadStore((s) => s.pushHistory);
	const addMessage = useCadStore((s) => s.addChatMessage);
	const { execute } = useCadEngine();

	const handleInsert = useCallback(() => {
		pushHistory("Before inserting part");
		setEditorCode(part.code);
		setActiveBottomTab("code");
		addMessage({
			role: "system",
			content: `Inserted part: ${part.name}`,
		});
		execute(part.code);
	}, [
		part,
		setEditorCode,
		setActiveBottomTab,
		pushHistory,
		addMessage,
		execute,
	]);

	return (
		<div className="group px-3 py-2 hover:bg-gray-800/50 transition-colors">
			<div className="flex items-start gap-2">
				<div className="flex-1 min-w-0">
					<div className="flex items-center gap-1.5">
						<span className="text-sm text-gray-200 truncate">{part.name}</span>
						{part.consciousnessState && (
							<SparklesIcon
								className={cn(
									"w-3 h-3 flex-shrink-0",
									CONSCIOUSNESS_COLORS[part.consciousnessState] ||
										"text-gray-500",
								)}
								title={`Consciousness: ${part.consciousnessState}`}
							/>
						)}
					</div>
					<p className="text-[10px] text-gray-500 truncate">
						{part.description}
					</p>
					<div className="flex gap-1 mt-1 flex-wrap">
						{part.tags.slice(0, 3).map((tag) => (
							<span
								key={tag}
								className="px-1.5 py-0 text-[9px] bg-gray-800 text-gray-500 rounded"
							>
								{tag}
							</span>
						))}
					</div>
				</div>
				<button
					type="button"
					onClick={handleInsert}
					className="opacity-0 group-hover:opacity-100 p-1 bg-forge-600/80 rounded text-white hover:bg-forge-600 transition-all"
					title="Insert part"
				>
					<PlusIcon className="w-3.5 h-3.5" />
				</button>
			</div>
		</div>
	);
}
