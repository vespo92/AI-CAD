/// <reference lib="webworker" />

/**
 * CAD Engine Web Worker
 *
 * Loads opencascade.js WASM via replicad-opencascadejs, then uses replicad
 * to execute user-written CAD code and return triangle mesh data.
 */

import type {
	ExportPayload,
	ImportPayload,
	MeshPayload,
	WorkerRequest,
	WorkerResponse,
} from "./types";

// These will be dynamically imported after WASM init
let replicadModule: typeof import("replicad") | null = null;
let isInitialized = false;

// Keep reference to last computed shape for export
// biome-ignore lint/suspicious/noExplicitAny: replicad Shape type is complex
let lastShape: any = null;

function respond(response: WorkerResponse) {
	self.postMessage(response);
}

function respondWithTransfer(
	response: WorkerResponse,
	transfer: Transferable[],
) {
	self.postMessage(response, transfer);
}

async function initializeEngine(id: string): Promise<void> {
	try {
		respond({
			id,
			type: "progress",
			payload: { stage: "Loading OpenCascade WASM...", percent: 10 },
		});

		// Dynamic import to avoid bundling issues with WASM
		const [opencascadeModule, replicad] = await Promise.all([
			import("replicad-opencascadejs/src/replicad_single.js"),
			import("replicad"),
		]);

		respond({
			id,
			type: "progress",
			payload: { stage: "Initializing kernel...", percent: 40 },
		});

		const opencascade = opencascadeModule.default;
		const OC = await opencascade();

		respond({
			id,
			type: "progress",
			payload: { stage: "Configuring replicad...", percent: 80 },
		});

		replicad.setOC(OC);
		replicadModule = replicad;
		isInitialized = true;

		respond({ id, type: "ready", payload: null });
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Failed to initialize engine";
		const stack = error instanceof Error ? error.stack : undefined;
		respond({ id, type: "error", payload: { message, stack } });
	}
}

function executeCode(id: string, code: string): void {
	if (!isInitialized || !replicadModule) {
		respond({
			id,
			type: "error",
			payload: { message: "Engine not initialized" },
		});
		return;
	}

	try {
		respond({
			id,
			type: "progress",
			payload: { stage: "Executing code...", percent: 30 },
		});

		// Build a function with replicad imports available in scope
		const r = replicadModule;
		const scopeEntries = {
			draw: r.draw,
			drawCircle: r.drawCircle,
			drawEllipse: r.drawEllipse,
			drawPolysides: r.drawPolysides,
			drawRoundedRectangle: r.drawRoundedRectangle,
			drawSingleCircle: r.drawSingleCircle,
			drawSingleEllipse: r.drawSingleEllipse,
			makeBaseBox: r.makeBaseBox,
			makeCylinder: r.makeCylinder,
			makeSphere: r.makeSphere,
			makeSolid: r.makeSolid,
			assembleWire: r.assembleWire,
			compoundShapes: r.compoundShapes,
			loft: r.loft,
			cast: r.cast,
		};

		const scopeKeys = Object.keys(scopeEntries);
		const scopeValues = Object.values(scopeEntries);

		// Strip import statements — user code shouldn't need them since we inject the scope
		const cleanCode = code
			.replace(/^\s*import\s+.*from\s+['"]replicad['"].*$/gm, "")
			.trim();

		// Wrap code so the last expression or `return` gives us the shape
		const wrappedCode = cleanCode.includes("return")
			? cleanCode
			: `${cleanCode}\n// Auto-return last variable if no explicit return\nreturn shape ?? result ?? model;`;

		const fn = new Function(...scopeKeys, wrappedCode);
		const shape = fn(...scopeValues);

		if (!shape || typeof shape.mesh !== "function") {
			respond({
				id,
				type: "error",
				payload: {
					message: `Code must return a replicad shape (e.g. \`return shape;\`). Got: ${shape === undefined ? "undefined" : typeof shape}`,
				},
			});
			return;
		}

		// Keep reference for export
		lastShape = shape;

		respond({
			id,
			type: "progress",
			payload: { stage: "Tessellating...", percent: 70 },
		});

		// Get face mesh
		const faceMesh = shape.mesh({ tolerance: 0.1 });
		const faceVertices = new Float32Array(faceMesh.vertices);
		const faceNormals = new Float32Array(faceMesh.normals);
		const faceTriangles = new Uint32Array(faceMesh.triangles);

		// Get edge mesh
		const edgeMesh = shape.meshEdges({ tolerance: 0.1 });
		const edgeVertices = new Float32Array(edgeMesh.lines);

		const payload: MeshPayload = {
			faces: {
				vertices: faceVertices,
				normals: faceNormals,
				triangles: faceTriangles,
			},
			edges: {
				vertices: edgeVertices,
			},
		};

		respondWithTransfer({ id, type: "mesh", payload }, [
			faceVertices.buffer,
			faceNormals.buffer,
			faceTriangles.buffer,
			edgeVertices.buffer,
		]);
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Code execution failed";
		const stack = error instanceof Error ? error.stack : undefined;
		respond({ id, type: "error", payload: { message, stack } });
	}
}

function exportModel(id: string, payload: ExportPayload): void {
	if (!isInitialized) {
		respond({
			id,
			type: "error",
			payload: { message: "Engine not initialized" },
		});
		return;
	}

	if (!lastShape) {
		respond({
			id,
			type: "error",
			payload: { message: "No model to export. Run code first." },
		});
		return;
	}

	try {
		respond({
			id,
			type: "progress",
			payload: {
				stage: `Exporting ${payload.format.toUpperCase()}...`,
				percent: 50,
			},
		});

		let blob: Blob;
		let mimeType: string;

		switch (payload.format) {
			case "step": {
				blob = lastShape.blobSTEP();
				mimeType = "application/step";
				break;
			}
			case "stl": {
				blob = lastShape.blobSTL({ binary: true });
				mimeType = "application/sla";
				break;
			}
			default:
				respond({
					id,
					type: "error",
					payload: { message: `Unsupported format: ${payload.format}` },
				});
				return;
		}

		// Convert blob to ArrayBuffer for transfer
		blob.arrayBuffer().then((data) => {
			respondWithTransfer(
				{
					id,
					type: "result",
					payload: {
						data,
						format: payload.format,
						filename: payload.filename,
						mimeType,
					},
				},
				[data],
			);
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : "Export failed";
		const stack = error instanceof Error ? error.stack : undefined;
		respond({ id, type: "error", payload: { message, stack } });
	}
}

async function importModel(id: string, payload: ImportPayload): Promise<void> {
	if (!isInitialized || !replicadModule) {
		respond({
			id,
			type: "error",
			payload: { message: "Engine not initialized" },
		});
		return;
	}

	try {
		respond({
			id,
			type: "progress",
			payload: {
				stage: `Importing ${payload.format.toUpperCase()}...`,
				percent: 30,
			},
		});

		const r = replicadModule;

		if (payload.format === "step") {
			// Use replicad's importSTEP to load the STEP file
			const blob = new Blob([payload.data], { type: "application/step" });
			const shape = await r.importSTEP(blob);

			if (!shape || typeof shape.mesh !== "function") {
				respond({
					id,
					type: "error",
					payload: {
						message: "Failed to parse STEP file — no valid geometry found",
					},
				});
				return;
			}

			lastShape = shape;

			respond({
				id,
				type: "progress",
				payload: { stage: "Tessellating imported model...", percent: 70 },
			});

			const faceMesh = shape.mesh({ tolerance: 0.1 });
			const faceVertices = new Float32Array(faceMesh.vertices);
			const faceNormals = new Float32Array(faceMesh.normals);
			const faceTriangles = new Uint32Array(faceMesh.triangles);

			const edgeMesh = shape.meshEdges({ tolerance: 0.1 });
			const edgeVertices = new Float32Array(edgeMesh.lines);

			const meshPayload: MeshPayload = {
				faces: {
					vertices: faceVertices,
					normals: faceNormals,
					triangles: faceTriangles,
				},
				edges: { vertices: edgeVertices },
			};

			respondWithTransfer({ id, type: "mesh", payload: meshPayload }, [
				faceVertices.buffer,
				faceNormals.buffer,
				faceTriangles.buffer,
				edgeVertices.buffer,
			]);
		} else {
			respond({
				id,
				type: "error",
				payload: {
					message: `Import not yet supported for format: ${payload.format}`,
				},
			});
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : "Import failed";
		const stack = error instanceof Error ? error.stack : undefined;
		respond({ id, type: "error", payload: { message, stack } });
	}
}

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
	const { id, type, payload } = event.data;

	switch (type) {
		case "init":
			initializeEngine(id);
			break;
		case "execute":
			executeCode(id, (payload as { code: string }).code);
			break;
		case "export":
			exportModel(id, payload as ExportPayload);
			break;
		case "import":
			importModel(id, payload as ImportPayload);
			break;
	}
};
