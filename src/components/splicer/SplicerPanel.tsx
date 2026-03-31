/**
 * Splicer Panel
 *
 * UI for managing splicer definitions, connection points, and splice assemblies.
 */

import { executeCode } from "@/lib/mcp/browser-executor";
import { generateAssemblyCode } from "@/lib/splicer/splicer-engine";
import { useSplicerMacroStore } from "@/lib/store/splicer-store";
import { cn } from "@/lib/utils/cn";
import {
	ArrowPathIcon,
	LinkIcon,
	PlayIcon,
	PlusIcon,
	TrashIcon,
} from "@heroicons/react/24/outline";
import { useState } from "react";

export function SplicerPanel({ className }: { className?: string }) {
	const splicers = useSplicerMacroStore((s) => s.splicers);
	const activeAssembly = useSplicerMacroStore((s) => s.activeAssembly);
	const selectedSplicerId = useSplicerMacroStore((s) => s.selectedSplicerId);
	const selectSplicer = useSplicerMacroStore((s) => s.selectSplicer);
	const removeSplicer = useSplicerMacroStore((s) => s.removeSplicer);
	const createAssembly = useSplicerMacroStore((s) => s.createAssembly);
	const removeJoint = useSplicerMacroStore((s) => s.removeJoint);

	const [assemblyName, setAssemblyName] = useState("");

	const handleCreateAssembly = () => {
		const name = assemblyName.trim() || "New Assembly";
		createAssembly(name);
		setAssemblyName("");
	};

	const handleExecuteAssembly = async () => {
		if (!activeAssembly) return;
		const code = generateAssemblyCode(activeAssembly);
		await executeCode(code);
	};

	return (
		<div className={cn("flex flex-col", className)}>
			{/* Header */}
			<div className="px-3 py-2 border-b border-gray-700">
				<h3 className="text-xs font-semibold text-gray-300 uppercase tracking-wider">
					Splicer
				</h3>
			</div>

			{/* Splicer Definitions */}
			<div className="flex-1 overflow-y-auto">
				<div className="px-3 py-2">
					<div className="flex items-center justify-between mb-2">
						<span className="text-[10px] font-medium text-gray-400 uppercase">
							Parts ({splicers.length})
						</span>
					</div>

					{splicers.length === 0 ? (
						<p className="text-[11px] text-gray-600 italic">
							No splicer definitions yet. Use the chat or MCP tools to create
							parts with connection points.
						</p>
					) : (
						<div className="space-y-1">
							{splicers.map((splicer) => (
								<div
									key={splicer.id}
									className={cn(
										"group flex items-center gap-2 px-2 py-1.5 rounded text-[11px] cursor-pointer transition-colors",
										selectedSplicerId === splicer.id
											? "bg-forge-500/20 text-forge-400"
											: "text-gray-400 hover:bg-gray-800 hover:text-gray-300",
									)}
									onClick={() => selectSplicer(splicer.id)}
									onKeyDown={(e) =>
										e.key === "Enter" && selectSplicer(splicer.id)
									}
								>
									<LinkIcon className="w-3 h-3 flex-shrink-0" />
									<div className="flex-1 min-w-0">
										<div className="truncate font-medium">
											{splicer.partName}
										</div>
										<div className="text-[9px] text-gray-600">
											{splicer.connections.length} connection
											{splicer.connections.length !== 1 ? "s" : ""}
										</div>
									</div>
									<button
										type="button"
										onClick={(e) => {
											e.stopPropagation();
											removeSplicer(splicer.id);
										}}
										className="opacity-0 group-hover:opacity-100 text-gray-600 hover:text-red-400 transition-opacity"
									>
										<TrashIcon className="w-3 h-3" />
									</button>
								</div>
							))}
						</div>
					)}
				</div>

				{/* Connection Points for selected splicer */}
				{selectedSplicerId &&
					(() => {
						const selected = splicers.find((s) => s.id === selectedSplicerId);
						if (!selected) return null;
						return (
							<div className="px-3 py-2 border-t border-gray-700/50">
								<span className="text-[10px] font-medium text-gray-400 uppercase">
									Connections: {selected.partName}
								</span>
								<div className="mt-1 space-y-0.5">
									{selected.connections.map((conn) => (
										<div
											key={conn.id}
											className="flex items-center gap-1.5 px-2 py-1 text-[10px] text-gray-500 rounded hover:bg-gray-800"
										>
											<span
												className={cn(
													"w-1.5 h-1.5 rounded-full",
													conn.gender === "male"
														? "bg-blue-400"
														: conn.gender === "female"
															? "bg-pink-400"
															: "bg-gray-400",
												)}
											/>
											<span className="flex-1 truncate">{conn.name}</span>
											<span className="text-gray-600">{conn.diameter}mm</span>
										</div>
									))}
								</div>
							</div>
						);
					})()}

				{/* Assembly Section */}
				<div className="px-3 py-2 border-t border-gray-700">
					<span className="text-[10px] font-medium text-gray-400 uppercase">
						Splice Assembly
					</span>

					{!activeAssembly ? (
						<div className="mt-2">
							<div className="flex gap-1">
								<input
									type="text"
									value={assemblyName}
									onChange={(e) => setAssemblyName(e.target.value)}
									placeholder="Assembly name..."
									className="flex-1 text-[11px] bg-gray-800 border border-gray-700 rounded px-2 py-1 text-gray-300 placeholder:text-gray-600 focus:outline-none focus:border-forge-500"
									onKeyDown={(e) => e.key === "Enter" && handleCreateAssembly()}
								/>
								<button
									type="button"
									onClick={handleCreateAssembly}
									className="px-1.5 bg-forge-500/20 text-forge-400 rounded hover:bg-forge-500/30"
								>
									<PlusIcon className="w-3.5 h-3.5" />
								</button>
							</div>
						</div>
					) : (
						<div className="mt-2 space-y-2">
							<div className="text-[11px] text-gray-300 font-medium">
								{activeAssembly.name}
							</div>
							<div className="text-[10px] text-gray-500">
								{activeAssembly.splicers.length} part(s),{" "}
								{activeAssembly.joints.length} joint(s)
							</div>

							{/* Joints */}
							{activeAssembly.joints.map((joint) => (
								<div
									key={joint.id}
									className="flex items-center gap-1.5 px-2 py-1 text-[10px] bg-gray-800 rounded"
								>
									<ArrowPathIcon className="w-3 h-3 text-forge-400" />
									<span className="flex-1 text-gray-400 truncate">
										{joint.jointType}
									</span>
									<button
										type="button"
										onClick={() => removeJoint(joint.id)}
										className="text-gray-600 hover:text-red-400"
									>
										<TrashIcon className="w-2.5 h-2.5" />
									</button>
								</div>
							))}

							{/* Execute Assembly */}
							<button
								type="button"
								onClick={handleExecuteAssembly}
								className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 text-[11px] font-medium bg-forge-500/20 text-forge-400 rounded hover:bg-forge-500/30 transition-colors"
							>
								<PlayIcon className="w-3 h-3" />
								Generate Assembly
							</button>
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
