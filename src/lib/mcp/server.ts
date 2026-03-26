/**
 * AI-CAD MCP Server
 *
 * Exposes CAD operations as MCP tools that any AI agent can call.
 * Runs as a standalone process (stdio transport) or embedded in the
 * browser via SSE transport.
 *
 * Usage:
 *   bun run apps/ai-cad/src/lib/mcp/server.ts         # stdio mode
 *   Or import and start programmatically with SSE transport
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
	version: "1.0.0",
});

// In-memory state for standalone server mode
let currentCode = "";
const engineReady = false;

// ─── Tools ───────────────────────────────────────────────────────

server.tool(
	"execute_code",
	"Execute Replicad TypeScript code in the CAD engine. Returns mesh data on success.",
	{
		code: z.string().describe("Replicad TypeScript code that returns a shape"),
		autoRun: z.boolean().optional().default(true),
	},
	async ({ code, autoRun }) => {
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
		// This tool returns the description for the LLM integration layer
		// to process. In standalone mode, it stores the intent.
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

// ─── Start Server ────────────────────────────────────────────────

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
