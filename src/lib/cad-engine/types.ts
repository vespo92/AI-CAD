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
	format: "step" | "stl";
	data: ArrayBuffer;
	filename: string;
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
