/**
 * MCP Module — Model Context Protocol integration for AI-CAD
 *
 * Provides:
 * - MCP Server: Expose CAD tools to AI agents
 * - MCP Bridge: Connect to external CAD apps (SolidWorks, Revit, etc.)
 * - Format Converters: STEP, STL, IFC, OBJ interchange
 */

export { server } from "./server";
export { McpBridge, getMcpBridge } from "./bridge";
export type { ExternalTarget, BridgeConfig } from "./bridge";
export { CAD_TOOLS } from "./tools";
export {
	FORMAT_REGISTRY,
	getBestFormat,
	meshToObj,
	meshToStlBinary,
	meshToIfcStep,
} from "./format-converters";
export type { CadFormat, FormatMetadata } from "./format-converters";
export {
	handleCreatePrimitive,
	handleModifyShape,
	handleGetModelInfo,
	getPreferredFormat,
} from "./tool-handlers";
