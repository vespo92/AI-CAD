/**
 * ai-cad — library entry point
 *
 * Usage:
 *   import { CadEngine, CadViewport, useCadEngine } from 'ai-cad'
 *
 * The consuming app must provide peer dependencies:
 *   react, react-dom, three, @react-three/fiber, @react-three/drei
 *
 * For the Web Worker + WASM setup see the README section on library usage.
 */

// ---------------------------------------------------------------------------
// Core engine
// ---------------------------------------------------------------------------
export {
	CadEngine,
	getCadEngine,
	configureWorkerUrl,
} from "./lib/cad-engine/engine";

// ---------------------------------------------------------------------------
// React hook
// ---------------------------------------------------------------------------
export { useCadEngine } from "./hooks/use-cad-engine";

// ---------------------------------------------------------------------------
// Viewport component (R3F canvas)
// ---------------------------------------------------------------------------
export { CadViewport } from "./components/viewport/CadViewport";

// ---------------------------------------------------------------------------
// Zustand store — exposed so consumers can read/drive CAD state
// ---------------------------------------------------------------------------
export { useCadStore } from "./lib/store/cad-store";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export type {
	WorkerMessageType,
	WorkerRequest,
	WorkerResponse,
	ExecutePayload,
	ExportPayload,
	ImportPayload,
	DxfAnalysisRequest,
	DxfAnalysisResult,
	FaceMesh,
	EdgeMesh,
	MeshPayload,
	ExportResultPayload,
	ErrorPayload,
	ProgressPayload,
} from "./lib/cad-engine/types";
