export type WorkerMessageType =
	| "init"
	| "execute"
	| "export"
	| "import"
	| "ready"
	| "result"
	| "mesh"
	| "error"
	| "progress";

export interface WorkerRequest {
	id: string;
	type: Extract<WorkerMessageType, "init" | "execute" | "export" | "import">;
	payload: unknown;
}

export interface WorkerResponse {
	id: string;
	type: Extract<
		WorkerMessageType,
		"ready" | "result" | "mesh" | "error" | "progress"
	>;
	payload: unknown;
}

export interface ExecutePayload {
	code: string;
}

export interface ExportPayload {
	format: "step" | "stl";
	filename: string;
}

export interface ImportPayload {
	format: "step" | "stl" | "dxf";
	data: ArrayBuffer;
	filename: string;
}

/** Result from DXF layer analysis (sent from main thread, not worker) */
export interface DxfAnalysisRequest {
	dxfContent: string;
}

export interface DxfAnalysisResult {
	layerCount: number;
	profileCount: number;
	proposedFeatureCount: number;
	warnings: string[];
	/** Serialized ReconstructionResult */
	reconstructionData: string;
	/** Generated replicad code for the first proposed feature */
	generatedCode: string | null;
}

export interface FaceMesh {
	vertices: Float32Array;
	normals: Float32Array;
	triangles: Uint32Array;
}

export interface EdgeMesh {
	vertices: Float32Array;
}

export interface MeshPayload {
	faces: FaceMesh;
	edges: EdgeMesh;
}

export interface ExportResultPayload {
	data: ArrayBuffer;
	format: string;
	filename: string;
	mimeType: string;
}

export interface ErrorPayload {
	message: string;
	stack?: string;
}

export interface ProgressPayload {
	stage: string;
	percent: number;
}
