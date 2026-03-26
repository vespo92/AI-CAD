import { useCadEngine } from "@/hooks/use-cad-engine";
import { useCadStore } from "@/lib/store/cad-store";
import { cn } from "@/lib/utils/cn";
import { PlayIcon } from "@heroicons/react/24/outline";
import { useCallback, useEffect, useState } from "react";

interface CodeEditorProps {
	className?: string;
}

export function CodeEditor({ className }: CodeEditorProps) {
	const editorCode = useCadStore((s) => s.editorCode);
	const setEditorCode = useCadStore((s) => s.setEditorCode);
	const isProcessing = useCadStore((s) => s.isProcessing);
	const isEngineReady = useCadStore((s) => s.isEngineReady);
	const { execute } = useCadEngine();
	const [MonacoEditor, setMonacoEditor] = useState<React.ComponentType<{
		value: string;
		onChange: (value: string | undefined) => void;
		language: string;
		theme: string;
		options: Record<string, unknown>;
		className?: string;
	}> | null>(null);

	// Lazy-load Monaco
	useState(() => {
		import("@monaco-editor/react").then((mod) => {
			setMonacoEditor(
				() =>
					mod.default as unknown as React.ComponentType<{
						value: string;
						onChange: (value: string | undefined) => void;
						language: string;
						theme: string;
						options: Record<string, unknown>;
						className?: string;
					}>,
			);
		});
	});

	const pushHistory = useCadStore((s) => s.pushHistory);

	const handleExecute = useCallback(() => {
		if (!isEngineReady || isProcessing) return;
		pushHistory("Before execution");
		execute(editorCode);
	}, [isEngineReady, isProcessing, execute, editorCode, pushHistory]);

	// Ctrl+Enter keyboard shortcut
	useEffect(() => {
		const handler = (e: KeyboardEvent) => {
			if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
				e.preventDefault();
				handleExecute();
			}
		};
		window.addEventListener("keydown", handler);
		return () => window.removeEventListener("keydown", handler);
	}, [handleExecute]);

	return (
		<div className={cn("flex flex-col", className)}>
			{/* Toolbar */}
			<div className="flex items-center justify-between px-3 py-1.5 border-b border-gray-700">
				<span className="text-xs text-gray-400 font-mono">replicad.ts</span>
				<button
					type="button"
					onClick={handleExecute}
					disabled={isProcessing || !isEngineReady}
					className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded bg-green-600/80 text-white hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
					title="Execute code (Ctrl+Enter)"
				>
					<PlayIcon className="w-3.5 h-3.5" />
					Run
				</button>
			</div>

			{/* Editor */}
			<div className="flex-1 min-h-0">
				{MonacoEditor ? (
					<MonacoEditor
						value={editorCode}
						onChange={(value) => setEditorCode(value || "")}
						language="typescript"
						theme="vs-dark"
						options={{
							minimap: { enabled: false },
							fontSize: 13,
							fontFamily: "'JetBrains Mono', 'Consolas', monospace",
							lineNumbers: "on",
							scrollBeyondLastLine: false,
							automaticLayout: true,
							tabSize: 2,
							wordWrap: "on",
							padding: { top: 8 },
						}}
					/>
				) : (
					<textarea
						value={editorCode}
						onChange={(e) => setEditorCode(e.target.value)}
						className="w-full h-full bg-gray-900 text-gray-200 font-mono text-sm p-3 resize-none outline-none"
						spellCheck={false}
					/>
				)}
			</div>
		</div>
	);
}
