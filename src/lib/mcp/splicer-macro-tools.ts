/**
 * MCP Tool Definitions for Splicer, Macro, and Batch Operations
 *
 * Extends the CAD MCP tools with operations for:
 * - Splicer: creating/managing connection points and splice assemblies
 * - Macros: recording, running, and managing parametric macros
 * - Batch: mass part creation via parameter sweeps
 */

import { z } from "zod";
import type { ToolDefinition } from "./tools";

// ─── Splicer Tool Schemas ──────────────────────────────────────

export const CreateSplicerSchema = z.object({
	partName: z.string().describe("Name of the part to create splicer for"),
	code: z.string().describe("Replicad code that generates the part geometry"),
	connections: z
		.array(
			z.object({
				name: z.string().describe("Connection point name"),
				position: z.object({ x: z.number(), y: z.number(), z: z.number() }),
				normal: z.object({ x: z.number(), y: z.number(), z: z.number() }),
				gender: z.enum(["male", "female", "neutral"]).default("neutral"),
				diameter: z
					.number()
					.default(10)
					.describe("Connection interface diameter in mm"),
				compatTags: z
					.array(z.string())
					.default([])
					.describe("Compatibility tags (e.g. 'M6', 'pipe-DN50')"),
			}),
		)
		.describe("Connection points on this part"),
	parameters: z
		.record(z.string(), z.number())
		.optional()
		.describe("Parameter values used to generate this part"),
});

export const SplicePartsSchema = z.object({
	sourceSplicerId: z.string().describe("ID of the source splicer definition"),
	sourceConnectionId: z.string().describe("ID of the source connection point"),
	targetSplicerId: z.string().describe("ID of the target splicer definition"),
	targetConnectionId: z.string().describe("ID of the target connection point"),
	jointType: z
		.enum([
			"butt",
			"insert",
			"weld",
			"fastener",
			"press-fit",
			"snap",
			"threaded",
		])
		.default("butt")
		.describe("Type of joint between parts"),
	fuse: z
		.boolean()
		.default(true)
		.describe("Whether to boolean-fuse the geometries"),
	offset: z.number().default(0).describe("Gap between faces in mm"),
});

export const FindCompatibleConnectionsSchema = z.object({
	sourceSplicerId: z.string().describe("ID of the source splicer definition"),
	targetSplicerId: z.string().describe("ID of the target splicer definition"),
});

export const AutoDetectConnectionsSchema = z.object({
	partName: z.string().describe("Name for the part"),
	code: z.string().describe("Replicad code for the part"),
	boundingBox: z
		.object({
			min: z.object({ x: z.number(), y: z.number(), z: z.number() }),
			max: z.object({ x: z.number(), y: z.number(), z: z.number() }),
		})
		.describe("Axis-aligned bounding box of the part"),
	compatTags: z
		.array(z.string())
		.default([])
		.describe("Tags for all auto-detected points"),
});

export const GenerateAssemblyCodeSchema = z.object({
	assemblyId: z
		.string()
		.describe("ID of the splice assembly to generate code for"),
});

export const ExtrudeWithConnectionsSchema = z.object({
	name: z.string().describe("Name for the extrusion"),
	sketchCode: z.string().describe("Replicad 2D sketch code"),
	extrusionType: z
		.enum(["linear", "tapered", "twisted", "along-path"])
		.default("linear"),
	height: z.number().default(20).describe("Extrusion height in mm"),
	taperAngle: z
		.number()
		.optional()
		.describe("Taper angle in degrees (for tapered)"),
	twistAngle: z
		.number()
		.optional()
		.describe("Twist angle in degrees (for twisted)"),
	pathCode: z.string().optional().describe("Path code (for along-path)"),
	connectionDiameter: z
		.number()
		.default(10)
		.describe("Diameter for auto-generated end connections"),
	compatTags: z
		.array(z.string())
		.default([])
		.describe("Tags for end connections"),
});

// ─── Macro Tool Schemas ────────────────────────────────────────

export const RunMacroSchema = z.object({
	macroId: z.string().describe("ID of the macro to execute"),
	parameters: z
		.record(z.string(), z.unknown())
		.optional()
		.describe("Parameter values to override defaults"),
	autoRun: z
		.boolean()
		.default(true)
		.describe("Whether to auto-execute the generated code"),
});

export const CreateMacroSchema = z.object({
	name: z.string().describe("Macro name"),
	description: z.string().describe("What this macro does"),
	category: z.string().default("Custom").describe("Category for organization"),
	parameters: z
		.array(
			z.object({
				name: z.string(),
				label: z.string(),
				type: z
					.enum(["number", "string", "boolean", "select", "point3d"])
					.default("number"),
				defaultValue: z.unknown(),
				min: z.number().optional(),
				max: z.number().optional(),
				step: z.number().optional(),
				unit: z.string().optional(),
			}),
		)
		.describe("Configurable parameters"),
	code: z
		.string()
		.describe("Replicad code template with ${paramName} interpolations"),
	tags: z.array(z.string()).default([]),
});

export const ListMacrosSchema = z.object({
	category: z.string().optional().describe("Filter by category"),
	search: z.string().optional().describe("Search query"),
});

export const RecordMacroSchema = z.object({
	action: z
		.enum(["start", "stop", "cancel"])
		.describe("Start, stop, or cancel recording"),
	name: z
		.string()
		.optional()
		.describe("Name for the recorded macro (required on stop)"),
});

// ─── Batch Tool Schemas ────────────────────────────────────────

export const CreateBatchJobSchema = z.object({
	macroId: z.string().describe("ID of the macro to use for batch generation"),
	sweeps: z
		.array(
			z.object({
				paramName: z.string().describe("Parameter to sweep"),
				sweepType: z
					.enum(["linear", "logarithmic", "list", "random"])
					.default("linear"),
				start: z.number().optional(),
				end: z.number().optional(),
				count: z.number().optional(),
				values: z.array(z.unknown()).optional(),
				min: z.number().optional(),
				max: z.number().optional(),
			}),
		)
		.describe("Parameter sweeps — cross-product generates all combinations"),
	namingTemplate: z
		.string()
		.default("Part-${index}")
		.describe(
			"Naming template for generated parts (use ${paramName} or ${index})",
		),
	concurrency: z.number().default(1).describe("Max concurrent executions"),
	autoExport: z
		.boolean()
		.default(false)
		.describe("Auto-export each generated part"),
	exportFormat: z.enum(["step", "stl"]).optional(),
	storeParts: z
		.boolean()
		.default(true)
		.describe("Save generated parts to database"),
	storeCategory: z.string().optional().describe("Category for stored parts"),
});

export const RunBatchJobSchema = z.object({
	batchId: z.string().describe("ID of the batch job to execute"),
});

export const GetBatchStatusSchema = z.object({
	batchId: z.string().describe("ID of the batch job to check"),
});

export const ListPartsSchema = z.object({
	category: z.string().optional().describe("Filter by category"),
	search: z.string().optional().describe("Search query"),
	limit: z.number().default(50).describe("Max results"),
});

export const GetDbStatsSchema = z.object({});

// ─── Tool Definitions ──────────────────────────────────────────

export const SPLICER_MACRO_TOOLS: ToolDefinition[] = [
	// Splicer tools
	{
		name: "create_splicer",
		description:
			"Create a splicer definition for a part with named connection points. Connection points enable automatic alignment when splicing parts together.",
		inputSchema: CreateSplicerSchema,
	},
	{
		name: "splice_parts",
		description:
			"Connect two parts at their connection points. Automatically computes alignment transforms and optionally fuses geometry.",
		inputSchema: SplicePartsSchema,
	},
	{
		name: "find_compatible_connections",
		description:
			"Find all compatible connection point pairs between two splicer definitions based on gender, size, and tags.",
		inputSchema: FindCompatibleConnectionsSchema,
	},
	{
		name: "auto_detect_connections",
		description:
			"Auto-detect connection points on a part based on its bounding box. Creates points at each face center.",
		inputSchema: AutoDetectConnectionsSchema,
	},
	{
		name: "generate_assembly_code",
		description:
			"Generate combined Replicad code for an entire splice assembly, with all parts aligned and optionally fused.",
		inputSchema: GenerateAssemblyCodeSchema,
	},
	{
		name: "extrude_with_connections",
		description:
			"Create an extrusion from a 2D sketch with automatic connection points at both ends. Supports linear, tapered, twisted, and path-based extrusion.",
		inputSchema: ExtrudeWithConnectionsSchema,
	},
	// Macro tools
	{
		name: "run_macro",
		description:
			"Execute a saved macro with given parameter values. Generates Replicad code from the macro template and optionally runs it in the CAD engine.",
		inputSchema: RunMacroSchema,
	},
	{
		name: "create_macro",
		description:
			"Create a new parametric macro from a code template. Parameters are referenced via ${paramName} syntax in the code.",
		inputSchema: CreateMacroSchema,
	},
	{
		name: "list_macros",
		description:
			"List available macros, optionally filtered by category or search query. Includes built-in and user-created macros.",
		inputSchema: ListMacrosSchema,
	},
	{
		name: "record_macro",
		description:
			"Start, stop, or cancel macro recording. While recording, CAD operations are captured as macro steps.",
		inputSchema: RecordMacroSchema,
	},
	// Batch tools
	{
		name: "create_batch_job",
		description:
			"Create a batch job for mass part creation. Define parameter sweeps (linear, log, list, random) — the cross-product of all sweeps generates one part per combination.",
		inputSchema: CreateBatchJobSchema,
	},
	{
		name: "run_batch_job",
		description:
			"Execute a batch job, generating code for each parameter combination. Results are stored in the parts database.",
		inputSchema: RunBatchJobSchema,
	},
	{
		name: "get_batch_status",
		description: "Get the current status and progress of a batch job.",
		inputSchema: GetBatchStatusSchema,
	},
	{
		name: "list_parts",
		description:
			"List parts stored in the database, including batch-generated parts. Supports category filter and text search.",
		inputSchema: ListPartsSchema,
	},
	{
		name: "get_db_stats",
		description:
			"Get statistics about the IndexedDB database — part count, macro count, batch jobs, etc.",
		inputSchema: GetDbStatsSchema,
	},
];
