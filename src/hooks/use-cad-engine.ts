import { getCadEngine } from "@/lib/cad-engine/engine";
import type { MeshPayload } from "@/lib/cad-engine/types";
import { useCadStore } from "@/lib/store/cad-store";
import { useConsoleStore } from "@/lib/store/console-store";
import { useCallback, useEffect, useRef } from "react";

export function useCadEngine() {
	const setEngineReady = useCadStore((s) => s.setEngineReady);
	const setMeshData = useCadStore((s) => s.setMeshData);
	const setProcessing = useCadStore((s) => s.setProcessing);
	const addChatMessage = useCadStore((s) => s.addChatMessage);
	const consoleLog = useConsoleStore((s) => s.log);
	const initialized = useRef(false);

	useEffect(() => {
		if (initialized.current) return;
		initialized.current = true;

		const engine = getCadEngine();

		engine.setOnMeshUpdate((mesh: MeshPayload) => {
			setMeshData(mesh);
			const vertCount = mesh.faces.vertices.length / 3;
			const triCount = mesh.faces.triangles.length / 3;
			consoleLog(
				`Mesh updated: ${vertCount} vertices, ${triCount} triangles`,
				"info",
				"engine",
			);
		});

		engine.setOnProgress((stage, percent) => {
			addChatMessage({ role: "system", content: stage });
			consoleLog(`[${percent}%] ${stage}`, "info", "engine");
		});

		engine.setOnError((error) => {
			setProcessing(false);
			addChatMessage({ role: "system", content: `Error: ${error}` });
			consoleLog(error, "error", "engine");
		});

		consoleLog("Initializing OpenCascade WASM engine...", "info", "system");

		engine
			.init()
			.then(() => {
				setEngineReady(true);
				addChatMessage({
					role: "system",
					content:
						"OpenCascade engine ready. Write Replicad code and click Run, or describe what you want to build.",
				});
				consoleLog(
					"OpenCascade engine initialized successfully",
					"info",
					"system",
				);
			})
			.catch((err) => {
				console.error("Engine init failed:", err);
				addChatMessage({
					role: "system",
					content: `Engine initialization failed: ${err instanceof Error ? err.message : "unknown error"}`,
				});
				consoleLog(
					`Engine init failed: ${err instanceof Error ? err.message : "unknown"}`,
					"error",
					"system",
				);
			});
	}, [setEngineReady, setMeshData, setProcessing, addChatMessage, consoleLog]);

	const execute = useCallback(
		async (code: string) => {
			const engine = getCadEngine();
			if (!engine.isReady) return;

			setProcessing(true);
			consoleLog("Executing code...", "info", "engine");
			const start = performance.now();

			try {
				await engine.execute(code);
				const elapsed = Math.round(performance.now() - start);
				addChatMessage({
					role: "system",
					content: `Model generated in ${elapsed}ms.`,
				});
				consoleLog(`Execution completed in ${elapsed}ms`, "info", "engine");
			} catch (err) {
				const msg = err instanceof Error ? err.message : "unknown";
				addChatMessage({
					role: "system",
					content: `Execution error: ${msg}`,
				});
				consoleLog(`Execution error: ${msg}`, "error", "engine");
			} finally {
				setProcessing(false);
			}
		},
		[setProcessing, addChatMessage, consoleLog],
	);

	const exportModel = useCallback(
		async (format: "step" | "stl") => {
			const engine = getCadEngine();
			if (!engine.isReady) return;

			const ext = format === "step" ? ".step" : ".stl";
			const filename = `${useCadStore.getState().model.name}${ext}`;
			consoleLog(
				`Exporting ${format.toUpperCase()}: ${filename}`,
				"info",
				"engine",
			);

			try {
				await engine.exportModel(format, filename);
				addChatMessage({
					role: "system",
					content: `Exported ${format.toUpperCase()} file: ${filename}`,
				});
				consoleLog(`Export complete: ${filename}`, "info", "engine");
			} catch (err) {
				const msg = err instanceof Error ? err.message : "unknown";
				addChatMessage({
					role: "system",
					content: `Export error: ${msg}`,
				});
				consoleLog(`Export error: ${msg}`, "error", "engine");
			}
		},
		[addChatMessage, consoleLog],
	);

	const importModel = useCallback(
		async (file: File) => {
			const engine = getCadEngine();
			if (!engine.isReady) return;

			const ext = file.name.split(".").pop()?.toLowerCase();
			if (ext !== "step" && ext !== "stp" && ext !== "stl" && ext !== "dxf") {
				addChatMessage({
					role: "system",
					content: `Unsupported import format: .${ext}. Supported: .step, .stp, .stl, .dxf`,
				});
				consoleLog(`Unsupported import format: .${ext}`, "warn", "engine");
				return;
			}

			setProcessing(true);
			consoleLog(
				`Importing ${file.name} (${(file.size / 1024).toFixed(1)} KB)`,
				"info",
				"engine",
			);
			const start = performance.now();

			try {
				const data = await file.arrayBuffer();
				const format = ext === "stl" ? "stl" : ext === "dxf" ? "dxf" : "step";
				await engine.importModel(format, data, file.name);
				const elapsed = Math.round(performance.now() - start);
				addChatMessage({
					role: "system",
					content: `Imported ${file.name} in ${elapsed}ms.`,
				});
				consoleLog(
					`Import complete: ${file.name} in ${elapsed}ms`,
					"info",
					"engine",
				);
			} catch (err) {
				const msg = err instanceof Error ? err.message : "unknown";
				addChatMessage({
					role: "system",
					content: `Import error: ${msg}`,
				});
				consoleLog(`Import error: ${msg}`, "error", "engine");
			} finally {
				setProcessing(false);
			}
		},
		[setProcessing, addChatMessage, consoleLog],
	);

	return { execute, exportModel, importModel };
}
