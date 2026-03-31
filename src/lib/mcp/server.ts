/**
 * AI-CAD MCP Server
 *
 * Exposes CAD operations as MCP tools that any AI agent can call.
 *
 * Two modes:
 *   1. Standalone (stdio): `bun run src/lib/mcp/server.ts`
 *      Tools return JSON descriptions of what to do.
 *   2. Browser-embedded: Import and call executeBrowserTool()
 *      Tools actually execute against the live CAD engine + store.
 *
 * Usage:
 *   bun run src/lib/mcp/server.ts         # stdio mode
 *   Or import executeBrowserTool() in the React app
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
	getPreferredFormat,
	handleCreatePrimitive,
	handleModifyShape,
} from "./tool-handlers";

const server = new McpServer({
	name: "ai-cad",
	version: "2.0.0",
});

// In-memory state for standalone server mode
let currentCode = "";
const engineReady = false;

// Browser executor reference — set at runtime when in browser context
let browserExecutor: typeof import("./browser-executor") | null = null;

/**
 * Initialize browser-side execution. Call this once from the React app
 * to enable MCP tools to actually drive the CAD engine.
 */
export async function initBrowserExecutor(): Promise<void> {
	browserExecutor = await import("./browser-executor");
}

/**
 * Execute an MCP tool in the browser context.
 * Returns the result from the actual CAD engine.
 */
export async function executeBrowserTool(
	toolName: string,
	args: Record<string, unknown>,
): Promise<{
	success: boolean;
	message: string;
	data?: Record<string, unknown>;
}> {
	if (!browserExecutor) {
		await initBrowserExecutor();
	}
	const executor = browserExecutor!.BROWSER_TOOL_REGISTRY[toolName];
	if (!executor) {
		return {
			success: false,
			message: `Unknown tool: ${toolName}. Available: ${Object.keys(browserExecutor!.BROWSER_TOOL_REGISTRY).join(", ")}`,
		};
	}
	return executor(args);
}

// ─── Tools ───────────────────────────────────────────────────────

server.tool(
	"execute_code",
	"Execute Replicad TypeScript code in the CAD engine. Returns mesh data on success.",
	{
		code: z.string().describe("Replicad TypeScript code that returns a shape"),
		autoRun: z.boolean().optional().default(true),
	},
	async ({ code, autoRun }) => {
		// Browser mode: actually execute
		if (browserExecutor) {
			const result = await browserExecutor.executeCode(code, autoRun);
			return {
				content: [{ type: "text" as const, text: JSON.stringify(result) }],
			};
		}
		// Standalone mode: store code
		currentCode = code;
		return {
			content: [
				{
					type: "text" as const,
					text: JSON.stringify({
						success: true,
						message: autoRun
							? "Code set and execution requested"
							: "Code set in editor",
						code,
					}),
				},
			],
		};
	},
);

server.tool(
	"create_primitive",
	"Create a 3D primitive (box, cylinder, sphere) with specified dimensions.",
	{
		type: z.enum(["box", "cylinder", "sphere"]),
		width: z.number().optional().describe("Width (X) in mm"),
		depth: z.number().optional().describe("Depth (Y) in mm"),
		height: z.number().optional().describe("Height (Z) in mm"),
		radius: z.number().optional().describe("Radius in mm"),
		x: z.number().optional().default(0).describe("Position X offset"),
		y: z.number().optional().default(0).describe("Position Y offset"),
		z: z.number().optional().default(0).describe("Position Z offset"),
	},
	async (params) => {
		// Browser mode
		if (browserExecutor) {
			const result = await browserExecutor.createPrimitive({
				type: params.type,
				dimensions: {
					width: params.width,
					depth: params.depth,
					height: params.height,
					radius: params.radius,
				},
				position: {
					x: params.x ?? 0,
					y: params.y ?? 0,
					z: params.z ?? 0,
				},
			});
			return {
				content: [{ type: "text" as const, text: JSON.stringify(result) }],
			};
		}
		// Standalone mode
		const result = handleCreatePrimitive({
			type: params.type,
			dimensions: {
				width: params.width,
				depth: params.depth,
				height: params.height,
				radius: params.radius,
			},
			position: { x: params.x ?? 0, y: params.y ?? 0, z: params.z ?? 0 },
		});
		if (result.code) currentCode = result.code;
		return {
			content: [{ type: "text" as const, text: JSON.stringify(result) }],
		};
	},
);

server.tool(
	"modify_shape",
	"Modify the current shape with fillet, chamfer, shell, boolean, translate, or rotate.",
	{
		operation: z.enum([
			"fillet",
			"chamfer",
			"shell",
			"cut",
			"fuse",
			"translate",
			"rotate",
		]),
		radius: z.number().optional(),
		distance: z.number().optional(),
		thickness: z.number().optional(),
		angle: z.number().optional(),
		x: z.number().optional(),
		y: z.number().optional(),
		z: z.number().optional(),
		code: z
			.string()
			.optional()
			.describe("Full replacement code if auto-modification is insufficient"),
	},
	async (params) => {
		// Browser mode
		if (browserExecutor) {
			const result = await browserExecutor.modifyShape({
				operation: params.operation,
				params: {
					radius: params.radius,
					distance: params.distance,
					thickness: params.thickness,
					angle: params.angle,
					x: params.x,
					y: params.y,
					z: params.z,
				},
				code: params.code,
			});
			return {
				content: [{ type: "text" as const, text: JSON.stringify(result) }],
			};
		}
		// Standalone mode
		const result = handleModifyShape(
			{
				operation: params.operation,
				params: {
					radius: params.radius,
					distance: params.distance,
					thickness: params.thickness,
					angle: params.angle,
					x: params.x,
					y: params.y,
					z: params.z,
				},
				code: params.code,
			},
			currentCode,
		);
		if (result.code) currentCode = result.code;
		return {
			content: [{ type: "text" as const, text: JSON.stringify(result) }],
		};
	},
);

server.tool(
	"export_model",
	"Export the current model to STEP (manufacturing) or STL (3D printing) format.",
	{
		format: z.enum(["step", "stl"]),
		filename: z.string().optional(),
	},
	async ({ format, filename }) => {
		// Browser mode
		if (browserExecutor) {
			const result = await browserExecutor.exportModel(format, filename);
			return {
				content: [{ type: "text" as const, text: JSON.stringify(result) }],
			};
		}
		// Standalone mode
		return {
			content: [
				{
					type: "text" as const,
					text: JSON.stringify({
						success: true,
						message: `Export requested: ${format.toUpperCase()}`,
						format,
						filename: filename || `model.${format}`,
					}),
				},
			],
		};
	},
);

server.tool(
	"get_model_info",
	"Get the current model state — engine status, features, and optionally the code.",
	{
		includeCode: z.boolean().optional().default(false),
	},
	async ({ includeCode }) => {
		// Browser mode
		if (browserExecutor) {
			const result = browserExecutor.getModelInfo(includeCode);
			return {
				content: [{ type: "text" as const, text: JSON.stringify(result) }],
			};
		}
		// Standalone mode
		const info: Record<string, unknown> = {
			engineReady,
			currentCode: includeCode ? currentCode : undefined,
			hasCode: currentCode.length > 0,
		};
		return {
			content: [{ type: "text" as const, text: JSON.stringify(info) }],
		};
	},
);

server.tool(
	"describe_model",
	"Generate a 3D model from a natural language description. The description is translated to Replicad code.",
	{
		description: z
			.string()
			.describe("Natural language description of the model to create"),
	},
	async ({ description }) => {
		return {
			content: [
				{
					type: "text" as const,
					text: JSON.stringify({
						success: true,
						message: "Description received — requires LLM processing",
						description,
						action: "generate_code",
					}),
				},
			],
		};
	},
);

server.tool(
	"send_to_external",
	"Send the current model to an external CAD application via the MCP bridge.",
	{
		target: z.enum(["solidworks", "revit", "freecad", "fusion360"]),
		format: z.enum(["step", "iges", "ifc", "stl"]).optional(),
	},
	async ({ target, format }) => {
		const preferredFormat = format || getPreferredFormat(target);
		return {
			content: [
				{
					type: "text" as const,
					text: JSON.stringify({
						success: true,
						message: `Bridge export requested: ${target} via ${preferredFormat.toUpperCase()}`,
						target,
						format: preferredFormat,
						action: "bridge_export",
					}),
				},
			],
		};
	},
);

server.tool(
	"import_model",
	"Import a 3D model from STEP, STL, IGES, or IFC format.",
	{
		format: z.enum(["step", "stl", "iges", "ifc"]),
		data: z.string().describe("Base64-encoded file data"),
		filename: z.string(),
	},
	async ({ format, data, filename }) => {
		// Browser mode: actually import
		if (browserExecutor && (format === "step" || format === "stl")) {
			const result = await browserExecutor.importModel(format, data, filename);
			return {
				content: [{ type: "text" as const, text: JSON.stringify(result) }],
			};
		}
		// Standalone mode
		return {
			content: [
				{
					type: "text" as const,
					text: JSON.stringify({
						success: true,
						message: `Import requested: ${filename} (${format.toUpperCase()})`,
						format,
						filename,
						dataLength: data.length,
						action: "import_model",
					}),
				},
			],
		};
	},
);

// ─── Splicer, Macro & Batch Tools ───────────────────────────────

server.tool(
	"create_splicer",
	"Create a splicer definition for a part with named connection points for automatic alignment.",
	{
		partName: z.string(),
		code: z.string().describe("Replicad code for the part"),
		connections: z.array(
			z.object({
				name: z.string(),
				position: z.object({ x: z.number(), y: z.number(), z: z.number() }),
				normal: z.object({ x: z.number(), y: z.number(), z: z.number() }),
				gender: z.enum(["male", "female", "neutral"]).default("neutral"),
				diameter: z.number().default(10),
				compatTags: z.array(z.string()).default([]),
			}),
		),
		parameters: z.record(z.string(), z.number()).optional(),
	},
	async (params) => {
		const result = await executeBrowserTool(
			"create_splicer",
			params as unknown as Record<string, unknown>,
		);
		return {
			content: [{ type: "text" as const, text: JSON.stringify(result) }],
		};
	},
);

server.tool(
	"splice_parts",
	"Connect two parts at their connection points with automatic alignment.",
	{
		sourceSplicerId: z.string(),
		sourceConnectionId: z.string(),
		targetSplicerId: z.string(),
		targetConnectionId: z.string(),
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
			.default("butt"),
		fuse: z.boolean().default(true),
		offset: z.number().default(0),
	},
	async (params) => {
		const result = await executeBrowserTool(
			"splice_parts",
			params as unknown as Record<string, unknown>,
		);
		return {
			content: [{ type: "text" as const, text: JSON.stringify(result) }],
		};
	},
);

server.tool(
	"find_compatible_connections",
	"Find compatible connection point pairs between two splicer definitions.",
	{
		sourceSplicerId: z.string(),
		targetSplicerId: z.string(),
	},
	async (params) => {
		const result = await executeBrowserTool(
			"find_compatible_connections",
			params as unknown as Record<string, unknown>,
		);
		return {
			content: [{ type: "text" as const, text: JSON.stringify(result) }],
		};
	},
);

server.tool(
	"extrude_with_connections",
	"Create an extrusion from a 2D sketch with auto-generated connection points at both ends.",
	{
		name: z.string(),
		sketchCode: z.string(),
		extrusionType: z
			.enum(["linear", "tapered", "twisted", "along-path"])
			.default("linear"),
		height: z.number().default(20),
		taperAngle: z.number().optional(),
		twistAngle: z.number().optional(),
		pathCode: z.string().optional(),
		connectionDiameter: z.number().default(10),
		compatTags: z.array(z.string()).default([]),
	},
	async (params) => {
		const result = await executeBrowserTool(
			"extrude_with_connections",
			params as unknown as Record<string, unknown>,
		);
		return {
			content: [{ type: "text" as const, text: JSON.stringify(result) }],
		};
	},
);

server.tool(
	"run_macro",
	"Execute a parametric macro with given parameter values.",
	{
		macroId: z.string(),
		parameters: z.record(z.string(), z.unknown()).optional(),
		autoRun: z.boolean().default(true),
	},
	async (params) => {
		const result = await executeBrowserTool(
			"run_macro",
			params as unknown as Record<string, unknown>,
		);
		return {
			content: [{ type: "text" as const, text: JSON.stringify(result) }],
		};
	},
);

server.tool(
	"create_macro",
	"Create a new parametric macro from a code template with ${paramName} interpolations.",
	{
		name: z.string(),
		description: z.string(),
		category: z.string().default("Custom"),
		parameters: z.array(
			z.object({
				name: z.string(),
				label: z.string(),
				type: z
					.enum(["number", "string", "boolean", "select", "point3d"])
					.default("number"),
				defaultValue: z.unknown(),
				min: z.number().optional(),
				max: z.number().optional(),
				unit: z.string().optional(),
			}),
		),
		code: z.string(),
		tags: z.array(z.string()).default([]),
	},
	async (params) => {
		const result = await executeBrowserTool(
			"create_macro",
			params as unknown as Record<string, unknown>,
		);
		return {
			content: [{ type: "text" as const, text: JSON.stringify(result) }],
		};
	},
);

server.tool(
	"list_macros",
	"List available macros (built-in + user-created). Optionally filter by category or search.",
	{
		category: z.string().optional(),
		search: z.string().optional(),
	},
	async (params) => {
		const result = await executeBrowserTool(
			"list_macros",
			params as unknown as Record<string, unknown>,
		);
		return {
			content: [{ type: "text" as const, text: JSON.stringify(result) }],
		};
	},
);

server.tool(
	"create_batch_job",
	"Create a mass part creation batch job with parameter sweeps. Cross-product of sweeps generates one part per combination.",
	{
		macroId: z.string(),
		sweeps: z.array(
			z.object({
				paramName: z.string(),
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
		),
		namingTemplate: z.string().default("Part-${index}"),
		concurrency: z.number().default(1),
		autoExport: z.boolean().default(false),
		exportFormat: z.enum(["step", "stl"]).optional(),
		storeParts: z.boolean().default(true),
		storeCategory: z.string().optional(),
	},
	async (params) => {
		const result = await executeBrowserTool(
			"create_batch_job",
			params as unknown as Record<string, unknown>,
		);
		return {
			content: [{ type: "text" as const, text: JSON.stringify(result) }],
		};
	},
);

server.tool(
	"run_batch_job",
	"Execute a batch job, generating code for each parameter combination and storing results.",
	{
		batchId: z.string(),
	},
	async (params) => {
		const result = await executeBrowserTool(
			"run_batch_job",
			params as unknown as Record<string, unknown>,
		);
		return {
			content: [{ type: "text" as const, text: JSON.stringify(result) }],
		};
	},
);

server.tool(
	"get_batch_status",
	"Get the current status and progress of a batch job.",
	{
		batchId: z.string(),
	},
	async (params) => {
		const result = await executeBrowserTool(
			"get_batch_status",
			params as unknown as Record<string, unknown>,
		);
		return {
			content: [{ type: "text" as const, text: JSON.stringify(result) }],
		};
	},
);

server.tool(
	"list_parts",
	"List parts stored in the IndexedDB database. Supports category filter and text search.",
	{
		category: z.string().optional(),
		search: z.string().optional(),
		limit: z.number().default(50),
	},
	async (params) => {
		const result = await executeBrowserTool(
			"list_parts",
			params as unknown as Record<string, unknown>,
		);
		return {
			content: [{ type: "text" as const, text: JSON.stringify(result) }],
		};
	},
);

server.tool(
	"get_db_stats",
	"Get database statistics — part count, macro count, batch jobs, splicers, etc.",
	{},
	async () => {
		const result = await executeBrowserTool("get_db_stats", {});
		return {
			content: [{ type: "text" as const, text: JSON.stringify(result) }],
		};
	},
);

// ─── Resources ───────────────────────────────────────────────────

server.resource("current-code", "ai-cad://current-code", async (uri) => ({
	contents: [
		{
			uri: uri.href,
			mimeType: "text/typescript",
			text: currentCode || "// No code loaded",
		},
	],
}));

server.resource(
	"replicad-api-reference",
	"ai-cad://replicad-api",
	async (uri) => ({
		contents: [
			{
				uri: uri.href,
				mimeType: "text/markdown",
				text: REPLICAD_API_REFERENCE,
			},
		],
	}),
);

// ─── Prompts ─────────────────────────────────────────────────────

server.prompt(
	"generate-cad",
	"Generate Replicad CAD code from a description",
	{ description: z.string().describe("What to model") },
	({ description }) => ({
		messages: [
			{
				role: "user" as const,
				content: {
					type: "text" as const,
					text: `Generate Replicad TypeScript code for: ${description}\n\nAvailable functions: draw(), drawRoundedRectangle(), drawCircle(), drawPolysides(), makeBaseBox(), makeCylinder(), makeSphere(). Code must return a shape.`,
				},
			},
		],
	}),
);

// ─── Reference ───────────────────────────────────────────────────

const REPLICAD_API_REFERENCE = `# Replicad API Reference

## 2D Drawing
- draw() — Freeform sketch path
- drawRoundedRectangle(width, height, radius)
- drawCircle(radius)
- drawEllipse(rx, ry)
- drawPolysides(radius, sides)

## 3D Primitives
- makeBaseBox(width, depth, height)
- makeCylinder(radius, height)
- makeSphere(radius)

## Sketch → 3D
- .sketchOnPlane("XY" | "XZ" | "YZ", offset?)
- .extrude(height)
- .revolve([axis])
- .loft(otherSketch)

## Modification
- .fillet(radius, filterFn)
- .chamfer(distance, filterFn)
- .shell(thickness, filterFn)
- .cut(otherShape)
- .fuse(otherShape)
- .translate(x, y, z)
- .rotate(angle)
- .mirror(plane)

## Export
- STEP format (manufacturing-ready)
- STL format (3D printing)
`;

export { server };

// Auto-start in stdio mode when run directly
if (typeof process !== "undefined" && process.argv[1]?.includes("server")) {
	const transport = new StdioServerTransport();
	server.connect(transport).then(() => {
		console.error("AI-CAD MCP Server running on stdio");
	});
}
