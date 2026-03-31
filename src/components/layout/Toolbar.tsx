import { useCadEngine } from "@/hooks/use-cad-engine";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useCadStore } from "@/lib/store/cad-store";
import { cn } from "@/lib/utils/cn";
import { EXPORT_FORMATS, type ExportFormat } from "@/types/cad";
import {
	ArrowDownTrayIcon,
	ArrowUpTrayIcon,
	ArrowUturnLeftIcon,
	ArrowUturnRightIcon,
	Cog6ToothIcon,
	CubeIcon,
	DocumentPlusIcon,
	PencilSquareIcon,
	RectangleGroupIcon,
} from "@heroicons/react/24/outline";
import { Link } from "@tanstack/react-router";
import { useCallback, useRef, useState } from "react";

interface ToolbarProps {
	onToggleRightPanel?: () => void;
}

export function Toolbar({ onToggleRightPanel }: ToolbarProps) {
	const { user, logout } = useAuth();
	const { exportModel, importModel } = useCadEngine();
	const modelName = useCadStore((s) => s.model.name);
	const canUndo = useCadStore((s) => s.canUndo);
	const canRedo = useCadStore((s) => s.canRedo);
	const undo = useCadStore((s) => s.undo);
	const redo = useCadStore((s) => s.redo);
	const viewMode = useCadStore((s) => s.viewMode);
	const setViewMode = useCadStore((s) => s.setViewMode);
	const [showExport, setShowExport] = useState(false);
	const fileInputRef = useRef<HTMLInputElement>(null);

	const handleImport = useCallback(() => {
		fileInputRef.current?.click();
	}, []);

	const handleFileChange = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			const file = e.target.files?.[0];
			if (file) {
				importModel(file);
			}
			// Reset so same file can be imported again
			if (fileInputRef.current) {
				fileInputRef.current.value = "";
			}
		},
		[importModel],
	);

	return (
		<div className="flex items-center h-10 px-3 bg-gray-850 border-b border-gray-700 gap-2">
			{/* Logo */}
			<div className="flex items-center gap-2 mr-4">
				<div className="w-6 h-6 bg-forge-500/10 rounded flex items-center justify-center">
					<CubeIcon className="w-4 h-4 text-forge-500" />
				</div>
				<span className="text-sm font-semibold text-gray-200">AI-CAD</span>
			</div>

			{/* Divider */}
			<div className="w-px h-5 bg-gray-700" />

			{/* File actions */}
			<ToolbarButton icon={DocumentPlusIcon} label="New" />

			<div className="w-px h-5 bg-gray-700" />

			{/* Edit actions */}
			<ToolbarButton
				icon={ArrowUturnLeftIcon}
				label="Undo"
				disabled={!canUndo}
				onClick={undo}
			/>
			<ToolbarButton
				icon={ArrowUturnRightIcon}
				label="Redo"
				disabled={!canRedo}
				onClick={redo}
			/>

			<div className="w-px h-5 bg-gray-700" />

			{/* View mode toggle: 3D / 2D Sketch */}
			<div className="flex items-center bg-gray-800 rounded overflow-hidden">
				<button
					type="button"
					onClick={() => setViewMode("3d")}
					className={cn(
						"flex items-center gap-1 px-2 py-1 text-xs transition-colors",
						viewMode === "3d"
							? "bg-forge-600/40 text-forge-400"
							: "text-gray-400 hover:text-gray-200",
					)}
					title="3D Viewport"
				>
					<CubeIcon className="w-3.5 h-3.5" />
					<span className="hidden sm:inline">3D</span>
				</button>
				<button
					type="button"
					onClick={() => setViewMode("sketch")}
					className={cn(
						"flex items-center gap-1 px-2 py-1 text-xs transition-colors",
						viewMode === "sketch"
							? "bg-forge-600/40 text-forge-400"
							: "text-gray-400 hover:text-gray-200",
					)}
					title="2D Sketch"
				>
					<PencilSquareIcon className="w-3.5 h-3.5" />
					<span className="hidden sm:inline">2D</span>
				</button>
			</div>

			<div className="w-px h-5 bg-gray-700" />

			{/* Import */}
			<ToolbarButton
				icon={ArrowUpTrayIcon}
				label="Import"
				onClick={handleImport}
			/>
			<input
				ref={fileInputRef}
				type="file"
				accept=".step,.stp,.stl"
				onChange={handleFileChange}
				className="hidden"
			/>

			{/* Export */}
			<div className="relative">
				<ToolbarButton
					icon={ArrowDownTrayIcon}
					label="Export"
					onClick={() => setShowExport(!showExport)}
				/>
				{showExport && (
					<div className="absolute top-full left-0 mt-1 w-56 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50 py-1">
						{(
							Object.entries(EXPORT_FORMATS) as [
								ExportFormat,
								(typeof EXPORT_FORMATS)[ExportFormat],
							][]
						).map(([key, format]) => (
							<button
								key={key}
								type="button"
								className="w-full text-left px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 flex items-center justify-between"
								onClick={() => {
									setShowExport(false);
									exportModel(key);
								}}
							>
								<span>{format.label}</span>
								<span className="text-xs text-gray-500">
									{format.extension}
								</span>
							</button>
						))}
					</div>
				)}
			</div>

			{/* Model name */}
			<div className="flex-1 text-center">
				<span className="text-sm text-gray-400">{modelName}</span>
			</div>

			{/* Convert & Export Panel */}
			<ToolbarButton
				icon={RectangleGroupIcon}
				label="Convert"
				onClick={onToggleRightPanel}
			/>

			{/* Settings */}
			<Link
				to="/settings"
				className="flex items-center gap-1.5 px-2 py-1 text-xs text-gray-400 rounded transition-colors hover:text-gray-200 hover:bg-gray-800"
				title="Settings"
			>
				<Cog6ToothIcon className="w-4 h-4" />
				<span className="hidden sm:inline">Settings</span>
			</Link>

			{/* User */}
			{user && (
				<div className="flex items-center gap-2 ml-2">
					<span className="text-xs text-gray-500">{user.name}</span>
					<button
						type="button"
						onClick={logout}
						className="text-xs text-gray-500 hover:text-gray-300"
					>
						Sign out
					</button>
				</div>
			)}
		</div>
	);
}

function ToolbarButton({
	icon: Icon,
	label,
	onClick,
	disabled,
}: {
	icon: React.ComponentType<{ className?: string }>;
	label: string;
	onClick?: () => void;
	disabled?: boolean;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			disabled={disabled}
			className={cn(
				"flex items-center gap-1.5 px-2 py-1 text-xs text-gray-400 rounded transition-colors",
				disabled
					? "opacity-30 cursor-not-allowed"
					: "hover:text-gray-200 hover:bg-gray-800",
			)}
			title={label}
		>
			<Icon className="w-4 h-4" />
			<span className="hidden sm:inline">{label}</span>
		</button>
	);
}
