import type { CadFormat, FileServerEntry } from "@/types/cad";
import { useState } from "react";
import { FileBrowser } from "../files/FileBrowser";
import { ConversionForm } from "./ConversionForm";

interface ExportPanelProps {
	className?: string;
}

export function ExportPanel({ className }: ExportPanelProps) {
	const [selectedFile, setSelectedFile] = useState<{
		name: string;
		path: string;
		format: CadFormat;
		size: number;
	} | null>(null);
	const [activeView, setActiveView] = useState<"browse" | "convert">("browse");

	const handleFileSelect = (entry: FileServerEntry) => {
		setSelectedFile({
			name: entry.name,
			path: entry.path,
			format: (entry.extension?.toLowerCase() || "stl") as CadFormat,
			size: entry.size,
		});
		setActiveView("convert");
	};

	return (
		<div className={className}>
			{/* View toggle */}
			<div className="flex items-center border-b border-gray-700 px-2">
				<button
					type="button"
					onClick={() => setActiveView("browse")}
					className={`px-3 py-1.5 text-[10px] font-medium border-b-2 transition-colors ${
						activeView === "browse"
							? "border-forge-500 text-forge-400"
							: "border-transparent text-gray-500 hover:text-gray-300"
					}`}
				>
					Browse Files
				</button>
				<button
					type="button"
					onClick={() => setActiveView("convert")}
					className={`px-3 py-1.5 text-[10px] font-medium border-b-2 transition-colors ${
						activeView === "convert"
							? "border-forge-500 text-forge-400"
							: "border-transparent text-gray-500 hover:text-gray-300"
					}`}
				>
					Convert
				</button>
			</div>

			{/* Content */}
			<div className="flex-1 min-h-0 overflow-y-auto">
				{activeView === "browse" ? (
					<FileBrowser onFileSelect={handleFileSelect} />
				) : (
					<div className="p-3">
						<ConversionForm selectedFile={selectedFile} />
					</div>
				)}
			</div>
		</div>
	);
}
