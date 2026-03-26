import { useDirectoryListing } from "@/hooks/use-conversion-queries";
import { formatFileSize } from "@/lib/utils/format";
import type { FileServerEntry } from "@/types/cad";
import {
	CubeIcon,
	DocumentIcon,
	FolderIcon,
} from "@heroicons/react/24/outline";
import { useState } from "react";

const CAD_EXTENSIONS = new Set([
	"scad",
	"step",
	"stp",
	"iges",
	"igs",
	"stl",
	"obj",
	"fbx",
	"gltf",
	"glb",
	"usd",
	"usda",
	"usdc",
	"usdz",
	"3mf",
	"dxf",
	"brep",
	"fcstd",
]);

interface FileBrowserProps {
	onFileSelect?: (entry: FileServerEntry) => void;
	initialPath?: string;
	className?: string;
}

export function FileBrowser({
	onFileSelect,
	initialPath = "/mnt/fileserver/cad",
	className,
}: FileBrowserProps) {
	const [currentPath, setCurrentPath] = useState(initialPath);
	const { data: entries, isLoading, error } = useDirectoryListing(currentPath);

	const pathSegments = currentPath.split("/").filter(Boolean);

	const handleNavigate = (entry: FileServerEntry) => {
		if (entry.type === "directory") {
			setCurrentPath(entry.path);
		} else {
			onFileSelect?.(entry);
		}
	};

	const navigateToSegment = (index: number) => {
		const path = `/${pathSegments.slice(0, index + 1).join("/")}`;
		setCurrentPath(path);
	};

	const isCadFile = (entry: FileServerEntry) =>
		entry.type === "file" &&
		entry.extension &&
		CAD_EXTENSIONS.has(entry.extension.toLowerCase());

	return (
		<div className={className}>
			{/* Breadcrumb */}
			<div className="px-3 py-2 border-b border-gray-700">
				<nav className="flex items-center gap-0.5 text-xs overflow-x-auto">
					<button
						type="button"
						onClick={() => setCurrentPath("/")}
						className="text-gray-500 hover:text-forge-400"
					>
						/
					</button>
					{pathSegments.map((segment, i) => (
						<span
							key={segment + String(i)}
							className="flex items-center gap-0.5"
						>
							<span className="text-gray-600">/</span>
							<button
								type="button"
								onClick={() => navigateToSegment(i)}
								className="text-gray-400 hover:text-forge-400 truncate max-w-[100px]"
							>
								{segment}
							</button>
						</span>
					))}
				</nav>
			</div>

			{/* File List */}
			<div className="divide-y divide-gray-700/50 overflow-y-auto">
				{isLoading && (
					<div className="p-6 text-center text-gray-500">
						<div className="animate-spin rounded-full h-5 w-5 border-b-2 border-forge-600 mx-auto mb-2" />
						<p className="text-xs">Loading files...</p>
					</div>
				)}

				{error && (
					<div className="p-4 text-center text-red-500 text-xs">
						Failed to load directory: {(error as Error).message}
					</div>
				)}

				{entries?.length === 0 && (
					<div className="p-4 text-center text-gray-500 text-xs">
						Empty directory
					</div>
				)}

				{entries
					?.sort((a, b) => {
						if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
						return a.name.localeCompare(b.name);
					})
					.map((entry) => (
						<button
							key={entry.path}
							type="button"
							onClick={() => handleNavigate(entry)}
							className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-800/50 transition-colors text-left"
						>
							{entry.type === "directory" ? (
								<FolderIcon className="h-4 w-4 text-amber-500 flex-shrink-0" />
							) : isCadFile(entry) ? (
								<CubeIcon className="h-4 w-4 text-forge-500 flex-shrink-0" />
							) : (
								<DocumentIcon className="h-4 w-4 text-gray-500 flex-shrink-0" />
							)}

							<div className="flex-1 min-w-0">
								<p className="text-xs font-medium text-gray-200 truncate">
									{entry.name}
								</p>
								{entry.type === "file" && (
									<p className="text-[10px] text-gray-500">
										{entry.extension?.toUpperCase()} &middot;{" "}
										{formatFileSize(entry.size)}
									</p>
								)}
							</div>

							{isCadFile(entry) && (
								<span className="px-1.5 py-0.5 text-[10px] font-medium bg-forge-900/30 text-forge-400 rounded-full flex-shrink-0">
									CAD
								</span>
							)}
						</button>
					))}
			</div>
		</div>
	);
}
