/**
 * Macro Panel
 *
 * UI for browsing, running, recording, and managing macros.
 * Also serves as the entry point for batch/mass part creation.
 */

import * as db from "@/lib/database/indexed-db";
import { BUILTIN_MACROS, executeMacro } from "@/lib/macro/macro-engine";
import { executeCode } from "@/lib/mcp/browser-executor";
import { useSplicerMacroStore } from "@/lib/store/splicer-store";
import { cn } from "@/lib/utils/cn";
import type { MacroDefinition } from "@/types/macro";
import {
	BoltIcon,
	CircleStackIcon,
	CogIcon,
	PlayIcon,
	StopIcon,
	TrashIcon,
} from "@heroicons/react/24/outline";
import { useEffect, useState } from "react";

export function MacroPanel({ className }: { className?: string }) {
	const storeMacros = useSplicerMacroStore((s) => s.macros);
	const selectedMacroId = useSplicerMacroStore((s) => s.selectedMacroId);
	const selectMacro = useSplicerMacroStore((s) => s.selectMacro);
	const removeMacro = useSplicerMacroStore((s) => s.removeMacro);
	const recording = useSplicerMacroStore((s) => s.recording);
	const startRecording = useSplicerMacroStore((s) => s.startRecording);
	const stopRecording = useSplicerMacroStore((s) => s.stopRecording);
	const cancelRecording = useSplicerMacroStore((s) => s.cancelRecording);
	const addMacro = useSplicerMacroStore((s) => s.addMacro);
	const addExecution = useSplicerMacroStore((s) => s.addExecution);
	const batchJobs = useSplicerMacroStore((s) => s.batchJobs);

	const [activeTab, setActiveTab] = useState<"macros" | "batch">("macros");
	const [paramValues, setParamValues] = useState<Record<string, unknown>>({});

	// Combine built-in + store macros
	const allMacros: MacroDefinition[] = [...BUILTIN_MACROS];
	for (const m of storeMacros) {
		if (!allMacros.find((bm) => bm.id === m.id)) {
			allMacros.push(m);
		}
	}

	const selectedMacro = allMacros.find((m) => m.id === selectedMacroId);

	// Reset param values when macro changes
	// biome-ignore lint/correctness/useExhaustiveDependencies: intentionally keyed on selectedMacro
	useEffect(() => {
		if (selectedMacro) {
			const defaults: Record<string, unknown> = {};
			for (const p of selectedMacro.parameters) {
				defaults[p.name] = p.defaultValue;
			}
			setParamValues(defaults);
		}
	}, [selectedMacro]);

	const handleRunMacro = async () => {
		if (!selectedMacro) return;
		const execution = executeMacro(selectedMacro, paramValues);
		addExecution(execution);
		if (execution.status === "completed") {
			await executeCode(execution.generatedCode);
		}
	};

	const handleStopRecording = async () => {
		const steps = stopRecording();
		if (steps.length > 0) {
			const macro: MacroDefinition = {
				id: crypto.randomUUID(),
				name: `Recording ${new Date().toLocaleTimeString()}`,
				description: `Recorded macro with ${steps.length} steps`,
				version: 1,
				parameters: [],
				steps,
				category: "Recorded",
				tags: ["recorded"],
				generatesSplicerPoints: false,
				createdAt: Date.now(),
				updatedAt: Date.now(),
			};
			addMacro(macro);
			await db.put("macros", macro);
		}
	};

	// Group macros by category
	const categories = new Map<string, MacroDefinition[]>();
	for (const m of allMacros) {
		const cat = m.category || "Uncategorized";
		if (!categories.has(cat)) categories.set(cat, []);
		categories.get(cat)?.push(m);
	}

	return (
		<div className={cn("flex flex-col", className)}>
			{/* Header with tabs */}
			<div className="flex items-center border-b border-gray-700 px-1">
				<button
					type="button"
					onClick={() => setActiveTab("macros")}
					className={cn(
						"flex items-center gap-1 px-2 py-1.5 text-[10px] font-medium border-b-2 transition-colors",
						activeTab === "macros"
							? "border-forge-500 text-forge-400"
							: "border-transparent text-gray-500 hover:text-gray-300",
					)}
				>
					<BoltIcon className="w-3 h-3" />
					Macros
				</button>
				<button
					type="button"
					onClick={() => setActiveTab("batch")}
					className={cn(
						"flex items-center gap-1 px-2 py-1.5 text-[10px] font-medium border-b-2 transition-colors",
						activeTab === "batch"
							? "border-forge-500 text-forge-400"
							: "border-transparent text-gray-500 hover:text-gray-300",
					)}
				>
					<CircleStackIcon className="w-3 h-3" />
					Batch ({batchJobs.length})
				</button>
			</div>

			{activeTab === "macros" ? (
				<div className="flex-1 overflow-y-auto">
					{/* Recording Controls */}
					<div className="px-3 py-2 border-b border-gray-700/50">
						{recording.isRecording ? (
							<div className="flex items-center gap-2">
								<span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
								<span className="text-[11px] text-red-400 flex-1">
									Recording ({recording.recordedSteps.length} steps)
								</span>
								<button
									type="button"
									onClick={handleStopRecording}
									className="px-2 py-0.5 text-[10px] bg-red-500/20 text-red-400 rounded hover:bg-red-500/30"
								>
									<StopIcon className="w-3 h-3 inline mr-0.5" />
									Stop
								</button>
								<button
									type="button"
									onClick={cancelRecording}
									className="px-2 py-0.5 text-[10px] text-gray-500 hover:text-gray-300"
								>
									Cancel
								</button>
							</div>
						) : (
							<button
								type="button"
								onClick={startRecording}
								className="flex items-center gap-1.5 px-2 py-1 text-[11px] text-gray-400 hover:text-forge-400 transition-colors"
							>
								<span className="w-2 h-2 rounded-full border border-red-500" />
								Record Macro
							</button>
						)}
					</div>

					{/* Macro List by Category */}
					{Array.from(categories.entries()).map(([cat, macros]) => (
						<div key={cat} className="px-3 py-1.5">
							<span className="text-[9px] font-semibold text-gray-600 uppercase tracking-wider">
								{cat}
							</span>
							<div className="mt-1 space-y-0.5">
								{macros.map((macro) => (
									<div
										key={macro.id}
										className={cn(
											"group flex items-center gap-2 px-2 py-1.5 rounded text-[11px] cursor-pointer transition-colors",
											selectedMacroId === macro.id
												? "bg-forge-500/20 text-forge-400"
												: "text-gray-400 hover:bg-gray-800 hover:text-gray-300",
										)}
										onClick={() => selectMacro(macro.id)}
										onKeyDown={(e) =>
											e.key === "Enter" && selectMacro(macro.id)
										}
									>
										<CogIcon className="w-3 h-3 flex-shrink-0" />
										<div className="flex-1 min-w-0">
											<div className="truncate font-medium">{macro.name}</div>
											<div className="text-[9px] text-gray-600 truncate">
												{macro.parameters.length} param
												{macro.parameters.length !== 1 ? "s" : ""}
												{macro.tags.length > 0 &&
													` · ${macro.tags.slice(0, 2).join(", ")}`}
											</div>
										</div>
										{!BUILTIN_MACROS.find((bm) => bm.id === macro.id) && (
											<button
												type="button"
												onClick={(e) => {
													e.stopPropagation();
													removeMacro(macro.id);
												}}
												className="opacity-0 group-hover:opacity-100 text-gray-600 hover:text-red-400"
											>
												<TrashIcon className="w-3 h-3" />
											</button>
										)}
									</div>
								))}
							</div>
						</div>
					))}

					{/* Selected Macro Parameters */}
					{selectedMacro && (
						<div className="px-3 py-2 border-t border-gray-700">
							<div className="text-[11px] text-gray-300 font-medium mb-1">
								{selectedMacro.name}
							</div>
							<div className="text-[10px] text-gray-500 mb-2">
								{selectedMacro.description}
							</div>

							{/* Parameters */}
							<div className="space-y-1.5">
								{selectedMacro.parameters.map((param) => (
									<div key={param.id}>
										{/* biome-ignore lint/a11y/noLabelWithoutControl: input is immediately after label */}
										<label className="flex items-center justify-between text-[10px]">
											<span className="text-gray-400">{param.label}</span>
											{param.unit && (
												<span className="text-gray-600">{param.unit}</span>
											)}
										</label>
										<input
											type={param.type === "number" ? "number" : "text"}
											value={String(
												paramValues[param.name] ?? param.defaultValue,
											)}
											onChange={(e) => {
												const val =
													param.type === "number"
														? Number(e.target.value)
														: e.target.value;
												setParamValues((prev) => ({
													...prev,
													[param.name]: val,
												}));
											}}
											min={param.min}
											max={param.max}
											step={param.step}
											className="w-full text-[11px] bg-gray-800 border border-gray-700 rounded px-2 py-1 text-gray-300 focus:outline-none focus:border-forge-500"
										/>
									</div>
								))}
							</div>

							{/* Run Button */}
							<button
								type="button"
								onClick={handleRunMacro}
								className="w-full mt-3 flex items-center justify-center gap-1.5 px-2 py-1.5 text-[11px] font-medium bg-forge-500/20 text-forge-400 rounded hover:bg-forge-500/30 transition-colors"
							>
								<PlayIcon className="w-3 h-3" />
								Run Macro
							</button>
						</div>
					)}
				</div>
			) : (
				/* Batch Tab */
				<BatchList />
			)}
		</div>
	);
}

function BatchList() {
	const batchJobs = useSplicerMacroStore((s) => s.batchJobs);
	const removeBatchJob = useSplicerMacroStore((s) => s.removeBatchJob);

	const statusColors: Record<string, string> = {
		draft: "text-gray-500",
		queued: "text-yellow-400",
		running: "text-blue-400",
		completed: "text-green-400",
		failed: "text-red-400",
		cancelled: "text-gray-500",
	};

	return (
		<div className="flex-1 overflow-y-auto">
			{batchJobs.length === 0 ? (
				<div className="px-3 py-4 text-center">
					<CircleStackIcon className="w-8 h-8 text-gray-700 mx-auto mb-2" />
					<p className="text-[11px] text-gray-600">
						No batch jobs yet. Use the chat or MCP tools to create mass part
						generation jobs.
					</p>
				</div>
			) : (
				<div className="space-y-1 p-2">
					{batchJobs.map((job) => (
						<div key={job.id} className="bg-gray-800 rounded p-2 text-[11px]">
							<div className="flex items-center justify-between">
								<span className="text-gray-300 font-medium truncate">
									{job.name}
								</span>
								<span className={cn("text-[9px]", statusColors[job.status])}>
									{job.status}
								</span>
							</div>
							<div className="text-[9px] text-gray-500 mt-0.5">
								{job.rows.length} parts · {job.macroName}
							</div>
							{job.status === "running" && (
								<div className="mt-1.5 h-1 bg-gray-700 rounded overflow-hidden">
									<div
										className="h-full bg-forge-500 transition-all duration-300"
										style={{ width: `${job.progress}%` }}
									/>
								</div>
							)}
							{job.status === "completed" && (
								<div className="text-[9px] text-green-500 mt-0.5">
									{job.rows.filter((r) => r.status === "completed").length} /{" "}
									{job.rows.length} parts generated
								</div>
							)}
							<div className="flex justify-end mt-1">
								<button
									type="button"
									onClick={() => removeBatchJob(job.id)}
									className="text-gray-600 hover:text-red-400"
								>
									<TrashIcon className="w-3 h-3" />
								</button>
							</div>
						</div>
					))}
				</div>
			)}
		</div>
	);
}
