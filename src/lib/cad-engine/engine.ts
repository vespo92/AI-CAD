import { reconstructFrom2D } from "@/lib/layer-identification";
import type {
	DxfAnalysisResult,
	ErrorPayload,
	ExportResultPayload,
	MeshPayload,
	WorkerResponse,
} from "./types";

type MessageHandler = (response: WorkerResponse) => void;

export class CadEngine {
	private worker: Worker | null = null;
	private pendingRequests = new Map<
		string,
		{
			resolve: (value: unknown) => void;
			reject: (reason: unknown) => void;
		}
	>();
	private onMeshUpdate: ((mesh: MeshPayload) => void) | null = null;
	private onProgress: ((stage: string, percent: number) => void) | null = null;
	private onError: ((error: string) => void) | null = null;
	private _isReady = false;

	get isReady() {
		return this._isReady;
	}

	async init(): Promise<void> {
		return new Promise((resolve, reject) => {
			try {
				this.worker = new Worker(new URL("./worker.ts", import.meta.url), {
					type: "module",
				});

				this.worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
					this.handleMessage(event.data);
				};

				this.worker.onerror = (error) => {
					console.error("CAD Worker error:", error);
					this.onError?.(`Worker error: ${error.message}`);
					reject(error);
				};

				const readyHandler: MessageHandler = (response) => {
					if (response.type === "ready") {
						this._isReady = true;
						resolve();
					}
				};

				// Temporarily listen for ready, forwarding progress during init
				const originalHandler = this.worker.onmessage;
				this.worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
					const data = event.data;
					if (data.type === "progress") {
						this.handleMessage(data);
					}
					readyHandler(data);
					if (
						data.type === "ready" &&
						originalHandler &&
						typeof originalHandler === "function"
					) {
						if (this.worker) this.worker.onmessage = originalHandler;
					}
				};

				this.worker.postMessage({ id: "init", type: "init", payload: {} });
			} catch (error) {
				reject(error);
			}
		});
	}

	private handleMessage(response: WorkerResponse) {
		switch (response.type) {
			case "ready":
				this._isReady = true;
				break;

			case "mesh": {
				const meshPayload = response.payload as MeshPayload;
				this.onMeshUpdate?.(meshPayload);
				this.resolvePending(response.id, meshPayload);
				break;
			}

			case "result": {
				const resultPayload = response.payload as ExportResultPayload;
				this.downloadExport(resultPayload);
				this.resolvePending(response.id, resultPayload);
				break;
			}

			case "error": {
				const errorPayload = response.payload as ErrorPayload;
				this.onError?.(errorPayload.message);
				this.rejectPending(response.id, new Error(errorPayload.message));
				break;
			}

			case "progress": {
				const progress = response.payload as {
					stage: string;
					percent: number;
				};
				this.onProgress?.(progress.stage, progress.percent);
				break;
			}
		}
	}

	private downloadExport(result: ExportResultPayload) {
		const blob = new Blob([result.data], { type: result.mimeType });
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = result.filename;
		a.click();
		URL.revokeObjectURL(url);
	}

	private resolvePending(id: string, value: unknown) {
		const pending = this.pendingRequests.get(id);
		if (pending) {
			pending.resolve(value);
			this.pendingRequests.delete(id);
		}
	}

	private rejectPending(id: string, error: unknown) {
		const pending = this.pendingRequests.get(id);
		if (pending) {
			pending.reject(error);
			this.pendingRequests.delete(id);
		}
	}

	private sendRequest(
		type: "execute" | "export" | "import",
		payload: unknown,
		transfer?: Transferable[],
	): Promise<unknown> {
		return new Promise((resolve, reject) => {
			if (!this.worker) {
				reject(new Error("CAD engine not initialized"));
				return;
			}

			const id = crypto.randomUUID();
			this.pendingRequests.set(id, { resolve, reject });
			if (transfer?.length) {
				this.worker.postMessage({ id, type, payload }, transfer);
			} else {
				this.worker.postMessage({ id, type, payload });
			}
		});
	}

	async execute(code: string): Promise<MeshPayload | null> {
		const result = await this.sendRequest("execute", { code });
		return result as MeshPayload | null;
	}

	async exportModel(format: "step" | "stl", filename: string): Promise<void> {
		await this.sendRequest("export", { format, filename });
	}

	async importModel(
		format: "step" | "stl" | "dxf",
		data: ArrayBuffer,
		filename: string,
	): Promise<MeshPayload | null> {
		// DXF files are handled on the main thread via layer identification
		if (format === "dxf") {
			const dxfContent = new TextDecoder().decode(data);
			const analysis = this.analyzeDxf(dxfContent);

			if (analysis.generatedCode) {
				// Execute the generated code in the CAD worker to produce a mesh
				return this.execute(analysis.generatedCode);
			}

			this.onError?.("DXF analysis found no extrudable profiles");
			return null;
		}

		const result = await this.sendRequest(
			"import",
			{ format, data, filename },
			[data],
		);
		return result as MeshPayload | null;
	}

	/**
	 * Analyze a DXF file: classify layers, extract profiles, propose 3D features.
	 * Runs on the main thread (not in the WASM worker) since it's pure TS logic.
	 */
	analyzeDxf(dxfContent: string): DxfAnalysisResult {
		const result = reconstructFrom2D(dxfContent);

		// Combine all proposed feature code into a single executable script
		let generatedCode: string | null = null;
		if (result.proposedFeatures.length > 0) {
			const mainFeature = result.proposedFeatures[0];
			generatedCode = mainFeature.codePreview;

			// If there are cuts, append them
			const cuts = result.proposedFeatures.filter((f) => f.type === "cut");
			if (cuts.length > 0 && generatedCode) {
				// Replace the final "return shape;" with cut operations
				generatedCode = generatedCode.replace(/return shape;/, "");
				for (const cut of cuts) {
					generatedCode += `\n${cut.codePreview}`;
				}
				generatedCode += "\nreturn shape;";
			}
		}

		return {
			layerCount: result.layers.length,
			profileCount: result.profiles.length,
			proposedFeatureCount: result.proposedFeatures.length,
			warnings: result.warnings,
			reconstructionData: JSON.stringify(result),
			generatedCode,
		};
	}

	setOnMeshUpdate(handler: (mesh: MeshPayload) => void) {
		this.onMeshUpdate = handler;
	}

	setOnProgress(handler: (stage: string, percent: number) => void) {
		this.onProgress = handler;
	}

	setOnError(handler: (error: string) => void) {
		this.onError = handler;
	}

	dispose() {
		if (this.worker) {
			this.worker.terminate();
			this.worker = null;
		}
		this._isReady = false;
		this.pendingRequests.clear();
	}
}

// Singleton instance
let engineInstance: CadEngine | null = null;

export function getCadEngine(): CadEngine {
	if (!engineInstance) {
		engineInstance = new CadEngine();
	}
	return engineInstance;
}
