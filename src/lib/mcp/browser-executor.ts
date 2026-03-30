/**
 * MCP Browser Executor
 *
 * Bridges MCP tool calls to the actual browser-based CAD engine.
 * When an MCP tool is called, this executor translates the request
 * into store mutations + engine execution, making the viewport update.
 *
 * This is what makes MCP tools actually *do things* instead of just
 * returning placeholder JSON.
 */

import { getCadEngine } from "@/lib/cad-engine/engine";
import { useCadStore } from "@/lib/store/cad-store";
import { useConsoleStore } from "@/lib/store/console-store";
import {
	handleCreatePrimitive,
	handleGetModelInfo,
	handleModifyShape,
} from "./tool-handlers";

export interface ExecutorResult {
	success: boolean;
	message: string;
	data?: Record<string, unknown>;
}

function log(message: string) {
	useConsoleStore.getState().log(message, "info", "mcp");
}

function logError(message: string) {
	useConsoleStore.getState().log(message, "error", "mcp");
}

/**
 * Execute code in the CAD engine and update the store.
 */
export async function executeCode(
	code: string,
	autoRun = true,
): Promise<ExecutorResult> {
	const store = useCadStore.getState();

	// Always set code in editor
	store.setEditorCode(code);
	store.pushHistory("MCP: execute_code");
	log(`Code set in editor (${code.length} chars)`);

	if (!autoRun) {
		return { success: true, message: "Code set in editor (not executed)" };
	}

	const engine = getCadEngine();
	if (!engine.isReady) {
		logError("Engine not ready");
		return { success: false, message: "CAD engine is not initialized yet" };
	}

	store.setProcessing(true);
	const start = performance.now();

	try {
		await engine.execute(code);
		const elapsed = Math.round(performance.now() - start);
		store.setProcessing(false);

		const meshData = useCadStore.getState().meshData;
		const vertCount = meshData ? meshData.faces.vertices.length / 3 : 0;

		log(`Executed in ${elapsed}ms — ${vertCount} vertices`);
		return {
			success: true,
			message: `Model generated in ${elapsed}ms`,
			data: { elapsed, vertices: vertCount },
		};
	} catch (err) {
		store.setProcessing(false);
		const msg = err instanceof Error ? err.message : "Execution failed";
		logError(`Execution error: ${msg}`);
		return { success: false, message: msg };
	}
}

/**
 * Create a primitive and execute it.
 */
export async function createPrimitive(params: {
	type: "box" | "cylinder" | "sphere";
	dimensions: {
		width?: number;
		depth?: number;
		height?: number;
		radius?: number;
	};
	position?: { x: number; y: number; z: number };
}): Promise<ExecutorResult> {
	const result = handleCreatePrimitive({
		type: params.type,
		dimensions: params.dimensions,
		position: params.position,
	});

	if (!result.success || !result.code) {
		return { success: false, message: result.message };
	}

	log(`Creating ${params.type} primitive`);
	return executeCode(result.code);
}

/**
 * Modify the current shape and re-execute.
 */
export async function modifyShape(params: {
	operation: string;
	params: Record<string, unknown>;
	code?: string;
}): Promise<ExecutorResult> {
	const currentCode = useCadStore.getState().editorCode;
	const result = handleModifyShape(
		{
			operation: params.operation as
				| "fillet"
				| "chamfer"
				| "shell"
				| "cut"
				| "fuse"
				| "translate"
				| "rotate",
			params: params.params,
			code: params.code,
		},
		currentCode,
	);

	if (!result.success || !result.code) {
		return { success: false, message: result.message };
	}

	log(`Applying ${params.operation} modification`);
	return executeCode(result.code);
}

/**
 * Export the current model.
 */
export async function exportModel(
	format: "step" | "stl",
	filename?: string,
): Promise<ExecutorResult> {
	const engine = getCadEngine();
	if (!engine.isReady) {
		return { success: false, message: "CAD engine is not initialized" };
	}

	const modelName = useCadStore.getState().model.name;
	const ext = format === "step" ? ".step" : ".stl";
	const outputName = filename || `${modelName}${ext}`;

	log(`Exporting ${format.toUpperCase()}: ${outputName}`);

	try {
		await engine.exportModel(format, outputName);
		return {
			success: true,
			message: `Exported ${format.toUpperCase()}: ${outputName}`,
		};
	} catch (err) {
		const msg = err instanceof Error ? err.message : "Export failed";
		logError(`Export error: ${msg}`);
		return { success: false, message: msg };
	}
}

/**
 * Import a model from base64-encoded data.
 */
export async function importModel(
	format: "step" | "stl",
	base64Data: string,
	filename: string,
): Promise<ExecutorResult> {
	const engine = getCadEngine();
	if (!engine.isReady) {
		return { success: false, message: "CAD engine is not initialized" };
	}

	log(`Importing ${filename} (${format.toUpperCase()})`);
	useCadStore.getState().setProcessing(true);

	try {
		const binary = atob(base64Data);
		const bytes = new Uint8Array(binary.length);
		for (let i = 0; i < binary.length; i++) {
			bytes[i] = binary.charCodeAt(i);
		}

		await engine.importModel(format, bytes.buffer, filename);
		useCadStore.getState().setProcessing(false);

		return {
			success: true,
			message: `Imported ${filename}`,
		};
	} catch (err) {
		useCadStore.getState().setProcessing(false);
		const msg = err instanceof Error ? err.message : "Import failed";
		logError(`Import error: ${msg}`);
		return { success: false, message: msg };
	}
}

/**
 * Get model info from the live store state.
 */
export function getModelInfo(includeCode = false): ExecutorResult {
	const state = useCadStore.getState();
	const result = handleGetModelInfo({ includeCode }, state);
	return result;
}

/**
 * Registry mapping tool names to executor functions.
 * Used by the MCP server to dispatch browser-side execution.
 */
export const BROWSER_TOOL_REGISTRY: Record<
	string,
	(args: Record<string, unknown>) => Promise<ExecutorResult>
> = {
	execute_code: async (args) =>
		executeCode(args.code as string, (args.autoRun as boolean) ?? true),

	create_primitive: async (args) =>
		createPrimitive({
			type: args.type as "box" | "cylinder" | "sphere",
			dimensions: (args.dimensions as Record<string, number>) || {
				width: args.width as number,
				depth: args.depth as number,
				height: args.height as number,
				radius: args.radius as number,
			},
			position: {
				x: (args.x as number) || 0,
				y: (args.y as number) || 0,
				z: (args.z as number) || 0,
			},
		}),

	modify_shape: async (args) =>
		modifyShape({
			operation: args.operation as string,
			params: (args.params as Record<string, unknown>) || {
				radius: args.radius,
				distance: args.distance,
				thickness: args.thickness,
				angle: args.angle,
				x: args.x,
				y: args.y,
				z: args.z,
			},
			code: args.code as string | undefined,
		}),

	export_model: async (args) =>
		exportModel(
			args.format as "step" | "stl",
			args.filename as string | undefined,
		),

	import_model: async (args) =>
		importModel(
			args.format as "step" | "stl",
			args.data as string,
			args.filename as string,
		),

	get_model_info: async (args) =>
		getModelInfo((args.includeCode as boolean) ?? false),
};
