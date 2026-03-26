/**
 * MCP Tool Handlers — Implementation logic for each CAD tool.
 *
 * These handlers are used both by the MCP server (for external agents)
 * and can be called directly from the browser UI.
 */

import type { z } from "zod";
import type {
	CreatePrimitiveSchema,
	GetModelInfoSchema,
	ModifyShapeSchema,
	SendToExternalSchema,
} from "./tools";

export interface ToolResult {
	success: boolean;
	message: string;
	code?: string;
	data?: Record<string, unknown>;
}

/**
 * Generate code for a primitive shape.
 */
export function handleCreatePrimitive(
	input: z.infer<typeof CreatePrimitiveSchema>,
): ToolResult {
	const { type, dimensions, position } = input;
	let code: string;

	switch (type) {
		case "box": {
			const w = dimensions.width || 50;
			const d = dimensions.depth || 50;
			const h = dimensions.height || 20;
			code = `const shape = makeBaseBox(${w}, ${d}, ${h})`;
			break;
		}
		case "cylinder": {
			const r = dimensions.radius || 20;
			const h = dimensions.height || 50;
			code = `const shape = makeCylinder(${r}, ${h})`;
			break;
		}
		case "sphere": {
			const r = dimensions.radius || 25;
			code = `const shape = makeSphere(${r})`;
			break;
		}
		default:
			return { success: false, message: `Unknown primitive type: ${type}` };
	}

	if (position && (position.x || position.y || position.z)) {
		code += `.translate(${position.x}, ${position.y}, ${position.z})`;
	}

	code += ";\nreturn shape;";

	return {
		success: true,
		message: `Generated ${type} primitive`,
		code,
	};
}

/**
 * Generate code for shape modification.
 */
export function handleModifyShape(
	input: z.infer<typeof ModifyShapeSchema>,
	currentCode: string,
): ToolResult {
	if (input.code) {
		return {
			success: true,
			message: `Applied ${input.operation} modification`,
			code: input.code,
		};
	}

	const { operation, params } = input;

	// Parse current code to find the shape variable
	const shapeMatch = currentCode.match(
		/(?:const|let)\s+(\w+)\s*=\s*[\s\S]*?;\s*return\s+\1;/,
	);
	if (!shapeMatch) {
		return {
			success: false,
			message:
				"Could not find shape variable in current code. Provide full code in the 'code' parameter.",
		};
	}

	const varName = shapeMatch[1];
	let modifier: string;

	switch (operation) {
		case "fillet":
			modifier = `.fillet(${(params as Record<string, number>).radius || 2}, (e) => e)`;
			break;
		case "chamfer":
			modifier = `.chamfer(${(params as Record<string, number>).distance || 1}, (e) => e)`;
			break;
		case "shell":
			modifier = `.shell(${(params as Record<string, number>).thickness || 2}, (f) => f)`;
			break;
		case "translate": {
			const p = params as Record<string, number>;
			modifier = `.translate(${p.x || 0}, ${p.y || 0}, ${p.z || 0})`;
			break;
		}
		case "rotate": {
			const p = params as Record<string, number>;
			modifier = `.rotate(${p.angle || 45})`;
			break;
		}
		default:
			return {
				success: false,
				message: `Cannot auto-generate code for '${operation}'. Provide full code.`,
			};
	}

	// Insert modifier before the return statement
	const newCode = currentCode.replace(
		new RegExp(`(return\\s+${varName})`),
		`const modified = ${varName}${modifier};\nreturn modified`,
	);

	return {
		success: true,
		message: `Applied ${operation} to shape`,
		code: newCode,
	};
}

/**
 * Get model info from the store state.
 */
export function handleGetModelInfo(
	input: z.infer<typeof GetModelInfoSchema>,
	storeState: {
		isEngineReady: boolean;
		isProcessing: boolean;
		model: { name: string; features: { name: string; type: string }[] };
		editorCode: string;
		meshData: unknown;
	},
): ToolResult {
	const info: Record<string, unknown> = {
		engineReady: storeState.isEngineReady,
		processing: storeState.isProcessing,
		modelName: storeState.model.name,
		featureCount: storeState.model.features.length,
		features: storeState.model.features.map((f) => ({
			name: f.name,
			type: f.type,
		})),
		hasGeometry: storeState.meshData !== null,
	};

	if (input.includeCode) {
		info.currentCode = storeState.editorCode;
	}

	return {
		success: true,
		message: "Model info retrieved",
		data: info,
	};
}

/**
 * Get the preferred export format for a target application.
 */
export function getPreferredFormat(
	target: z.infer<typeof SendToExternalSchema>["target"],
): "step" | "iges" | "ifc" | "stl" {
	switch (target) {
		case "solidworks":
			return "step";
		case "revit":
			return "ifc";
		case "freecad":
			return "step";
		case "fusion360":
			return "step";
		default:
			return "step";
	}
}
