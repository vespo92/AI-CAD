/**
 * MCP Tool Definitions for the AI-CAD Platform
 *
 * These tools expose CAD operations as structured MCP tools that any
 * AI agent can call. The tools drive the same CAD engine used by the
 * browser UI.
 */

import { z } from "zod";

// ─── Tool Input Schemas ──────────────────────────────────────────

export const ExecuteCodeSchema = z.object({
	code: z
		.string()
		.describe(
			"Replicad TypeScript code to execute. Must return a shape via `return shape;`",
		),
	autoRun: z
		.boolean()
		.optional()
		.default(true)
		.describe("Whether to automatically execute the code in the CAD engine"),
});

export const CreatePrimitiveSchema = z.object({
	type: z
		.enum(["box", "cylinder", "sphere"])
		.describe("Type of primitive to create"),
	dimensions: z
		.object({
			width: z.number().optional().describe("Width (X) in mm"),
			depth: z.number().optional().describe("Depth (Y) in mm"),
			height: z.number().optional().describe("Height (Z) in mm"),
			radius: z.number().optional().describe("Radius in mm"),
		})
		.describe("Dimensions for the primitive"),
	position: z
		.object({
			x: z.number().default(0),
			y: z.number().default(0),
			z: z.number().default(0),
		})
		.optional()
		.describe("Position offset from origin"),
});

export const ModifyShapeSchema = z.object({
	operation: z
		.enum(["fillet", "chamfer", "shell", "cut", "fuse", "translate", "rotate"])
		.describe("Modification operation to apply"),
	params: z
		.record(z.string(), z.unknown())
		.describe("Operation-specific parameters (radius, distance, axis, etc.)"),
	code: z
		.string()
		.optional()
		.describe("Optional: full Replicad code if the modification requires it"),
});

export const ExportModelSchema = z.object({
	format: z
		.enum(["step", "stl"])
		.describe("Export format — STEP for manufacturing, STL for 3D printing"),
	filename: z
		.string()
		.optional()
		.describe("Output filename (without extension)"),
});

export const GetModelInfoSchema = z.object({
	includeCode: z
		.boolean()
		.optional()
		.default(false)
		.describe("Whether to include the current editor code"),
});

export const DescribeModelSchema = z.object({
	description: z
		.string()
		.describe(
			"Natural language description of the model to create (e.g., 'a bracket with two mounting holes')",
		),
});

export const ImportModelSchema = z.object({
	format: z
		.enum(["step", "stl", "iges", "ifc"])
		.describe("File format being imported"),
	data: z.string().describe("Base64-encoded file data"),
	filename: z.string().describe("Original filename"),
});

export const SendToExternalSchema = z.object({
	target: z
		.enum(["solidworks", "revit", "freecad", "fusion360"])
		.describe("Target CAD application"),
	format: z
		.enum(["step", "iges", "ifc", "stl"])
		.optional()
		.describe("Override export format (auto-selected by default)"),
	options: z
		.record(z.string(), z.unknown())
		.optional()
		.describe("Target-specific export options"),
});

// ─── Tool Definitions ────────────────────────────────────────────

export interface ToolDefinition {
	name: string;
	description: string;
	inputSchema: z.ZodType;
}

export const CAD_TOOLS: ToolDefinition[] = [
	{
		name: "execute_code",
		description:
			"Execute Replicad TypeScript code in the CAD engine. The code should create 3D geometry and return a shape. All replicad functions (draw, makeBaseBox, makeCylinder, etc.) are available in scope without imports.",
		inputSchema: ExecuteCodeSchema,
	},
	{
		name: "create_primitive",
		description:
			"Create a basic 3D primitive shape (box, cylinder, or sphere) with specified dimensions. Returns generated code and optionally auto-executes it.",
		inputSchema: CreatePrimitiveSchema,
	},
	{
		name: "modify_shape",
		description:
			"Apply a modification to the current shape — fillet, chamfer, shell, boolean cut/fuse, translate, or rotate. Generates the appropriate code modification.",
		inputSchema: ModifyShapeSchema,
	},
	{
		name: "export_model",
		description:
			"Export the current 3D model to STEP (manufacturing-ready) or STL (3D printing) format. Returns a download link.",
		inputSchema: ExportModelSchema,
	},
	{
		name: "get_model_info",
		description:
			"Get information about the current model state — engine status, whether a model is loaded, feature list, and optionally the current code.",
		inputSchema: GetModelInfoSchema,
	},
	{
		name: "describe_model",
		description:
			"Generate a 3D model from a natural language description. Uses the CAD system prompt to translate descriptions into Replicad code, then executes it.",
		inputSchema: DescribeModelSchema,
	},
	{
		name: "import_model",
		description:
			"Import a 3D model from an external file (STEP, STL, IGES, or IFC format). Accepts base64-encoded file data.",
		inputSchema: ImportModelSchema,
	},
	{
		name: "send_to_external",
		description:
			"Send the current model to an external CAD application (SolidWorks, Revit, FreeCAD, Fusion 360) via the MCP bridge. Auto-selects the best interchange format.",
		inputSchema: SendToExternalSchema,
	},
];
