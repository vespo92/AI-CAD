import { getCadEngine } from "@/lib/cad-engine/engine";
import type { MeshPayload } from "@/lib/cad-engine/types";
import { useCadStore } from "@/lib/store/cad-store";
import { useCallback, useEffect, useRef } from "react";

export function useCadEngine() {
	const setEngineReady = useCadStore((s) => s.setEngineReady);
	const setMeshData = useCadStore((s) => s.setMeshData);
	const setProcessing = useCadStore((s) => s.setProcessing);
	const addChatMessage = useCadStore((s) => s.addChatMessage);
	const initialized = useRef(false);

	useEffect(() => {
		if (initialized.current) return;
		initialized.current = true;

		const engine = getCadEngine();

		engine.setOnMeshUpdate((mesh: MeshPayload) => {
			setMeshData(mesh);
		});

		engine.setOnProgress((stage, _percent) => {
			addChatMessage({ role: "system", content: stage });
		});

		engine.setOnError((error) => {
			setProcessing(false);
			addChatMessage({ role: "system", content: `Error: ${error}` });
		});

		engine
			.init()
			.then(() => {
				setEngineReady(true);
				addChatMessage({
					role: "system",
					content:
						"OpenCascade engine ready. Write Replicad code and click Run, or describe what you want to build.",
				});
			})
			.catch((err) => {
				console.error("Engine init failed:", err);
				addChatMessage({
					role: "system",
					content: `Engine initialization failed: ${err instanceof Error ? err.message : "unknown error"}`,
				});
			});
	}, [setEngineReady, setMeshData, setProcessing, addChatMessage]);

	const execute = useCallback(
		async (code: string) => {
			const engine = getCadEngine();
			if (!engine.isReady) return;

			setProcessing(true);
			const start = performance.now();

			try {
				await engine.execute(code);
				const elapsed = Math.round(performance.now() - start);
				addChatMessage({
					role: "system",
					content: `Model generated in ${elapsed}ms.`,
				});
			} catch (err) {
				addChatMessage({
					role: "system",
					content: `Execution error: ${err instanceof Error ? err.message : "unknown"}`,
				});
			} finally {
				setProcessing(false);
			}
		},
		[setProcessing, addChatMessage],
	);

	const exportModel = useCallback(
		async (format: "step" | "stl") => {
			const engine = getCadEngine();
			if (!engine.isReady) return;

			const ext = format === "step" ? ".step" : ".stl";
			const filename = `${useCadStore.getState().model.name}${ext}`;

			try {
				await engine.exportModel(format, filename);
				addChatMessage({
					role: "system",
					content: `Exported ${format.toUpperCase()} file: ${filename}`,
				});
			} catch (err) {
				addChatMessage({
					role: "system",
					content: `Export error: ${err instanceof Error ? err.message : "unknown"}`,
				});
			}
		},
		[addChatMessage],
	);

	const importModel = useCallback(
		async (file: File) => {
			const engine = getCadEngine();
			if (!engine.isReady) return;

			const ext = file.name.split(".").pop()?.toLowerCase();
			if (ext !== "step" && ext !== "stp" && ext !== "stl") {
				addChatMessage({
					role: "system",
					content: `Unsupported import format: .${ext}. Supported: .step, .stp, .stl`,
				});
				return;
			}

			setProcessing(true);
			const start = performance.now();

			try {
				const data = await file.arrayBuffer();
				const format = ext === "stl" ? "stl" : "step";
				await engine.importModel(format, data, file.name);
				const elapsed = Math.round(performance.now() - start);
				addChatMessage({
					role: "system",
					content: `Imported ${file.name} in ${elapsed}ms.`,
				});
			} catch (err) {
				addChatMessage({
					role: "system",
					content: `Import error: ${err instanceof Error ? err.message : "unknown"}`,
				});
			} finally {
				setProcessing(false);
			}
		},
		[setProcessing, addChatMessage],
	);

	return { execute, exportModel, importModel };
}
