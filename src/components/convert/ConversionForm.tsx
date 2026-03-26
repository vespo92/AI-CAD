import { useStartConversion } from "@/hooks/use-conversion-queries";
import { cn } from "@/lib/utils/cn";
import { formatFileSize } from "@/lib/utils/format";
import type {
	CadFormat,
	ConversionEngine,
	ConversionExportTarget,
	ConversionOptions,
} from "@/types/cad";
import { ENGINE_INFO, EXPORT_PRESETS } from "@/types/cad";
import { CubeIcon, SparklesIcon } from "@heroicons/react/24/outline";
import { useState } from "react";

interface ConversionFormProps {
	selectedFile?: {
		name: string;
		path: string;
		format: CadFormat;
		size: number;
	} | null;
}

export function ConversionForm({ selectedFile }: ConversionFormProps) {
	const [exportTarget, setExportTarget] =
		useState<ConversionExportTarget>("unity");
	const [targetFormat, setTargetFormat] = useState<CadFormat>("fbx");
	const [engine, setEngine] = useState<ConversionEngine>("freecad");
	const [llmEnhance, setLlmEnhance] = useState(true);
	const [meshQuality, setMeshQuality] =
		useState<ConversionOptions["meshQuality"]>("high");
	const [generateUVs, setGenerateUVs] = useState(true);
	const [generateNormals, setGenerateNormals] = useState(true);
	const [optimizeForTarget, setOptimizeForTarget] = useState(true);

	const startConversion = useStartConversion();
	const preset = EXPORT_PRESETS[exportTarget];

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		if (!selectedFile) return;

		startConversion.mutate({
			sourcePath: selectedFile.path,
			targetFormat,
			exportTarget,
			engine,
			llmEnhance,
			options: {
				meshQuality,
				generateUVs,
				generateNormals,
				optimizeForTarget,
			},
		});
	};

	return (
		<form onSubmit={handleSubmit} className="space-y-4">
			{/* Selected File */}
			<div className="card p-3">
				<h3 className="text-xs font-medium text-gray-500 mb-2">Source File</h3>
				{selectedFile ? (
					<div className="flex items-center gap-3">
						<CubeIcon className="h-8 w-8 text-forge-500" />
						<div>
							<p className="text-sm font-medium text-white">
								{selectedFile.name}
							</p>
							<p className="text-xs text-gray-400">
								{selectedFile.format.toUpperCase()} &middot;{" "}
								{formatFileSize(selectedFile.size)}
							</p>
						</div>
					</div>
				) : (
					<p className="text-xs text-gray-500">
						Select a file from the file browser
					</p>
				)}
			</div>

			{/* Export Target */}
			<div className="card p-3">
				<h3 className="text-xs font-medium text-gray-400 mb-2">
					Export Target
				</h3>
				<div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
					{(
						Object.entries(EXPORT_PRESETS) as [
							ConversionExportTarget,
							(typeof EXPORT_PRESETS)[ConversionExportTarget],
						][]
					).map(([key, value]) => (
						<button
							key={key}
							type="button"
							onClick={() => {
								setExportTarget(key);
								setTargetFormat(value.formats[0]);
							}}
							className={cn(
								"px-2 py-1.5 rounded-lg text-xs font-medium border transition-colors",
								exportTarget === key
									? "border-forge-500 bg-forge-900/20 text-forge-400"
									: "border-gray-700 text-gray-400 hover:border-gray-600",
							)}
						>
							{key === "3d-print"
								? "3D Print"
								: key.charAt(0).toUpperCase() + key.slice(1)}
						</button>
					))}
				</div>
				<p className="mt-2 text-[10px] text-gray-500">{preset.description}</p>
			</div>

			{/* Output Format */}
			<div className="card p-3">
				<label
					htmlFor="targetFormat"
					className="block text-xs font-medium text-gray-400 mb-1.5"
				>
					Output Format
				</label>
				<select
					id="targetFormat"
					value={targetFormat}
					onChange={(e) => setTargetFormat(e.target.value as CadFormat)}
					className="input"
				>
					{preset.formats.map((fmt) => (
						<option key={fmt} value={fmt}>
							.{fmt.toUpperCase()}
						</option>
					))}
				</select>
			</div>

			{/* Conversion Engine */}
			<div className="card p-3">
				<h3 className="text-xs font-medium text-gray-400 mb-2">
					Conversion Engine
				</h3>
				<div className="space-y-1.5">
					{(
						Object.entries(ENGINE_INFO) as [
							ConversionEngine,
							(typeof ENGINE_INFO)[ConversionEngine],
						][]
					).map(([key, info]) => (
						<label
							key={key}
							htmlFor={`engine-${key}`}
							className={cn(
								"flex items-start gap-2 p-2 rounded-lg border cursor-pointer transition-colors",
								engine === key
									? "border-forge-500 bg-forge-900/20"
									: "border-gray-700 hover:border-gray-600",
							)}
						>
							<input
								type="radio"
								id={`engine-${key}`}
								name="engine"
								value={key}
								checked={engine === key}
								onChange={(e) => setEngine(e.target.value as ConversionEngine)}
								className="mt-0.5"
							/>
							<div>
								<p className="text-xs font-medium text-white">{info.name}</p>
								<p className="text-[10px] text-gray-500 mt-0.5">
									{info.description}
								</p>
							</div>
						</label>
					))}
				</div>
			</div>

			{/* Mesh Options */}
			<div className="card p-3">
				<h3 className="text-xs font-medium text-gray-400 mb-2">Mesh Options</h3>
				<div className="space-y-2">
					<div>
						<label
							htmlFor="meshQuality"
							className="block text-[10px] text-gray-500 mb-1"
						>
							Mesh Quality
						</label>
						<select
							id="meshQuality"
							value={meshQuality}
							onChange={(e) =>
								setMeshQuality(
									e.target.value as ConversionOptions["meshQuality"],
								)
							}
							className="input"
						>
							<option value="low">Low (faster)</option>
							<option value="medium">Medium</option>
							<option value="high">High</option>
							<option value="ultra">Ultra (slower)</option>
						</select>
					</div>

					<div className="flex flex-wrap gap-3">
						<label
							htmlFor="generateUVs"
							className="flex items-center gap-1.5 text-xs text-gray-300"
						>
							<input
								type="checkbox"
								id="generateUVs"
								checked={generateUVs}
								onChange={(e) => setGenerateUVs(e.target.checked)}
								className="rounded border-gray-600 text-forge-600 focus:ring-forge-500"
							/>
							Generate UVs
						</label>
						<label
							htmlFor="generateNormals"
							className="flex items-center gap-1.5 text-xs text-gray-300"
						>
							<input
								type="checkbox"
								id="generateNormals"
								checked={generateNormals}
								onChange={(e) => setGenerateNormals(e.target.checked)}
								className="rounded border-gray-600 text-forge-600 focus:ring-forge-500"
							/>
							Generate Normals
						</label>
						<label
							htmlFor="optimizeForTarget"
							className="flex items-center gap-1.5 text-xs text-gray-300"
						>
							<input
								type="checkbox"
								id="optimizeForTarget"
								checked={optimizeForTarget}
								onChange={(e) => setOptimizeForTarget(e.target.checked)}
								className="rounded border-gray-600 text-forge-600 focus:ring-forge-500"
							/>
							Optimize for {exportTarget}
						</label>
					</div>
				</div>
			</div>

			{/* LLM Enhancement */}
			<div className="card p-3">
				<label
					htmlFor="llmEnhance"
					className="flex items-center justify-between cursor-pointer"
				>
					<div className="flex items-center gap-2">
						<SparklesIcon className="h-4 w-4 text-amber-500" />
						<div>
							<p className="text-xs font-medium text-white">
								LLM-Enhanced Conversion
							</p>
							<p className="text-[10px] text-gray-500">
								Uses ESPO LLM Gateway to optimize parameters and repair geometry
							</p>
						</div>
					</div>
					<input
						type="checkbox"
						id="llmEnhance"
						checked={llmEnhance}
						onChange={(e) => setLlmEnhance(e.target.checked)}
						className="rounded border-gray-600 text-forge-600 focus:ring-forge-500"
					/>
				</label>
			</div>

			{/* Submit */}
			<button
				type="submit"
				disabled={!selectedFile || startConversion.isPending}
				className="btn-primary w-full py-2"
			>
				{startConversion.isPending
					? "Starting conversion..."
					: "Start Conversion"}
			</button>

			{startConversion.isError && (
				<p className="text-xs text-red-500 text-center">
					{(startConversion.error as Error).message}
				</p>
			)}

			{startConversion.isSuccess && (
				<p className="text-xs text-green-400 text-center">
					Conversion job started! Check Jobs for progress.
				</p>
			)}
		</form>
	);
}
