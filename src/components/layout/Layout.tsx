import { AssemblyPanel } from "@/components/assembly/AssemblyPanel";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { ExportPanel } from "@/components/convert/ExportPanel";
import { JobList } from "@/components/convert/JobList";
import { CodeEditor } from "@/components/editor/CodeEditor";
import { FeatureTree } from "@/components/feature-tree/FeatureTree";
import { PartLibrary } from "@/components/parts/PartLibrary";
import { CadViewport } from "@/components/viewport/CadViewport";
import { useCadStore } from "@/lib/store/cad-store";
import { useConsoleStore } from "@/lib/store/console-store";
import { cn } from "@/lib/utils/cn";
import {
	ArrowDownTrayIcon,
	ChatBubbleLeftRightIcon,
	ClockIcon,
	CodeBracketIcon,
	CommandLineIcon,
	CubeIcon,
	CubeTransparentIcon,
	SparklesIcon,
} from "@heroicons/react/24/outline";
import { useEffect, useRef } from "react";
import { Toolbar } from "./Toolbar";

const BOTTOM_TABS = [
	{ id: "chat" as const, label: "Chat", icon: ChatBubbleLeftRightIcon },
	{ id: "code" as const, label: "Code", icon: CodeBracketIcon },
	{ id: "console" as const, label: "Console", icon: CommandLineIcon },
];

const LEFT_TABS = [
	{ id: "features" as const, label: "Features", icon: CubeIcon },
	{ id: "parts" as const, label: "Parts", icon: SparklesIcon },
	{ id: "assembly" as const, label: "Assembly", icon: CubeTransparentIcon },
];

const RIGHT_TABS = [
	{ id: "export" as const, label: "Export", icon: ArrowDownTrayIcon },
	{ id: "jobs" as const, label: "Jobs", icon: ClockIcon },
];

export function Layout() {
	const leftPanelWidth = useCadStore((s) => s.leftPanelWidth);
	const rightPanelWidth = useCadStore((s) => s.rightPanelWidth);
	const bottomPanelHeight = useCadStore((s) => s.bottomPanelHeight);
	const activeBottomTab = useCadStore((s) => s.activeBottomTab);
	const setActiveBottomTab = useCadStore((s) => s.setActiveBottomTab);
	const activeLeftTab = useCadStore((s) => s.activeLeftTab);
	const setActiveLeftTab = useCadStore((s) => s.setActiveLeftTab);
	const activeRightTab = useCadStore((s) => s.activeRightTab);
	const setActiveRightTab = useCadStore((s) => s.setActiveRightTab);
	const rightPanelOpen = useCadStore((s) => s.rightPanelOpen);
	const toggleRightPanel = useCadStore((s) => s.toggleRightPanel);

	return (
		<div className="flex flex-col h-full bg-gray-900">
			{/* Top toolbar */}
			<Toolbar onToggleRightPanel={toggleRightPanel} />

			{/* Main content area */}
			<div className="flex-1 flex min-h-0">
				{/* Left panel */}
				<div
					className="flex-shrink-0 bg-gray-850 border-r border-gray-700 overflow-hidden flex flex-col"
					style={{ width: leftPanelWidth }}
				>
					{/* Left tab bar */}
					<div className="flex items-center border-b border-gray-700 px-1">
						{LEFT_TABS.map((tab) => (
							<button
								key={tab.id}
								type="button"
								onClick={() => setActiveLeftTab(tab.id)}
								className={cn(
									"flex items-center gap-1 px-2 py-1.5 text-[10px] font-medium border-b-2 transition-colors",
									activeLeftTab === tab.id
										? "border-forge-500 text-forge-400"
										: "border-transparent text-gray-500 hover:text-gray-300",
								)}
							>
								<tab.icon className="w-3 h-3" />
								{tab.label}
							</button>
						))}
					</div>

					{/* Left tab content */}
					<div className="flex-1 min-h-0 overflow-hidden">
						{activeLeftTab === "features" && <FeatureTree className="h-full" />}
						{activeLeftTab === "parts" && <PartLibrary className="h-full" />}
						{activeLeftTab === "assembly" && (
							<AssemblyPanel className="h-full" />
						)}
					</div>
				</div>

				{/* Center — Viewport + Bottom panel */}
				<div className="flex-1 flex flex-col min-w-0">
					{/* 3D Viewport */}
					<CadViewport className="flex-1 min-h-0" />

					{/* Bottom panel */}
					<div
						className="flex-shrink-0 bg-gray-850 border-t border-gray-700 flex flex-col"
						style={{ height: bottomPanelHeight }}
					>
						{/* Tab bar */}
						<div className="flex items-center border-b border-gray-700 px-1">
							{BOTTOM_TABS.map((tab) => (
								<button
									key={tab.id}
									type="button"
									onClick={() => setActiveBottomTab(tab.id)}
									className={cn(
										"flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border-b-2 transition-colors",
										activeBottomTab === tab.id
											? "border-forge-500 text-forge-400"
											: "border-transparent text-gray-500 hover:text-gray-300",
									)}
								>
									<tab.icon className="w-3.5 h-3.5" />
									{tab.label}
								</button>
							))}
						</div>

						{/* Tab content */}
						<div className="flex-1 min-h-0">
							{activeBottomTab === "chat" && <ChatPanel className="h-full" />}
							{activeBottomTab === "code" && <CodeEditor className="h-full" />}
							{activeBottomTab === "console" && <ConsolePanel />}
						</div>
					</div>
				</div>

				{/* Right panel — Export / Convert / Jobs */}
				{rightPanelOpen && (
					<div
						className="flex-shrink-0 bg-gray-850 border-l border-gray-700 overflow-hidden flex flex-col"
						style={{ width: rightPanelWidth }}
					>
						{/* Right tab bar */}
						<div className="flex items-center border-b border-gray-700 px-1">
							{RIGHT_TABS.map((tab) => (
								<button
									key={tab.id}
									type="button"
									onClick={() => setActiveRightTab(tab.id)}
									className={cn(
										"flex items-center gap-1 px-2 py-1.5 text-[10px] font-medium border-b-2 transition-colors",
										activeRightTab === tab.id
											? "border-forge-500 text-forge-400"
											: "border-transparent text-gray-500 hover:text-gray-300",
									)}
								>
									<tab.icon className="w-3 h-3" />
									{tab.label}
								</button>
							))}
						</div>

						{/* Right tab content */}
						<div className="flex-1 min-h-0 overflow-hidden">
							{activeRightTab === "export" && (
								<ExportPanel className="h-full flex flex-col" />
							)}
							{activeRightTab === "jobs" && (
								<div className="h-full overflow-y-auto">
									<JobList />
								</div>
							)}
						</div>
					</div>
				)}
			</div>
		</div>
	);
}

function ConsolePanel() {
	const entries = useConsoleStore((s) => s.entries);
	const filter = useConsoleStore((s) => s.filter);
	const setFilter = useConsoleStore((s) => s.setFilter);
	const clearConsole = useConsoleStore((s) => s.clear);
	const endRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		endRef.current?.scrollIntoView({ behavior: "smooth" });
	}, [entries.length]);

	const filtered =
		filter === "all" ? entries : entries.filter((e) => e.level === filter);

	const levelColors: Record<string, string> = {
		info: "text-blue-400",
		warn: "text-yellow-400",
		error: "text-red-400",
		debug: "text-gray-500",
	};

	const sourceColors: Record<string, string> = {
		engine: "text-green-500",
		worker: "text-purple-400",
		chat: "text-forge-400",
		mcp: "text-cyan-400",
		system: "text-gray-500",
	};

	return (
		<div className="h-full flex flex-col">
			<div className="flex items-center gap-2 px-3 py-1 border-b border-gray-700 text-[10px]">
				{(["all", "info", "warn", "error", "debug"] as const).map((f) => (
					<button
						key={f}
						type="button"
						onClick={() => setFilter(f)}
						className={cn(
							"px-1.5 py-0.5 rounded",
							filter === f
								? "bg-gray-700 text-white"
								: "text-gray-500 hover:text-gray-300",
						)}
					>
						{f}
					</button>
				))}
				<div className="flex-1" />
				<span className="text-gray-600">{filtered.length} entries</span>
				<button
					type="button"
					onClick={clearConsole}
					className="text-gray-500 hover:text-gray-300"
				>
					Clear
				</button>
			</div>
			<div className="flex-1 overflow-y-auto p-2 font-mono text-[11px] space-y-0.5">
				{filtered.length === 0 && (
					<p className="text-gray-600 italic">No log entries</p>
				)}
				{filtered.map((entry) => (
					<div key={entry.id} className="flex gap-2 leading-tight">
						<span className="text-gray-600 flex-shrink-0">
							{new Date(entry.timestamp).toLocaleTimeString()}
						</span>
						<span
							className={cn(
								"flex-shrink-0 uppercase w-10",
								levelColors[entry.level],
							)}
						>
							{entry.level}
						</span>
						{entry.source && (
							<span
								className={cn(
									"flex-shrink-0 w-14",
									sourceColors[entry.source] || "text-gray-500",
								)}
							>
								[{entry.source}]
							</span>
						)}
						<span className="text-gray-300 break-all">{entry.message}</span>
					</div>
				))}
				<div ref={endRef} />
			</div>
		</div>
	);
}
