/**
 * MCP-to-MCP Bridge
 *
 * Connects the AI-CAD MCP server to external CAD application MCP servers
 * (SolidWorks, Revit, FreeCAD, Fusion 360). Handles format translation,
 * model transfer, and bidirectional sync.
 *
 * Architecture:
 *   AI-CAD MCP Server ←→ Bridge ←→ External MCP Servers
 *
 * The bridge acts as both an MCP client (connecting to external servers)
 * and extends the AI-CAD server with bridge-specific tools.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

export type ExternalTarget = "solidworks" | "revit" | "freecad" | "fusion360";

export interface BridgeConfig {
	target: ExternalTarget;
	transport: "stdio" | "sse";
	/** For stdio: command and args to launch the external MCP server */
	command?: string;
	args?: string[];
	/** For SSE: URL of the external MCP server */
	url?: string;
	/** Preferred interchange format */
	preferredFormat: "step" | "iges" | "ifc" | "stl";
}

/** Default configurations for known targets */
export const DEFAULT_BRIDGE_CONFIGS: Record<ExternalTarget, BridgeConfig> = {
	solidworks: {
		target: "solidworks",
		transport: "stdio",
		command: "solidworks-mcp",
		args: [],
		preferredFormat: "step",
	},
	revit: {
		target: "revit",
		transport: "sse",
		url: "http://localhost:3100/mcp",
		preferredFormat: "ifc",
	},
	freecad: {
		target: "freecad",
		transport: "stdio",
		command: "freecad-mcp",
		args: [],
		preferredFormat: "step",
	},
	fusion360: {
		target: "fusion360",
		transport: "sse",
		url: "http://localhost:3200/mcp",
		preferredFormat: "step",
	},
};

interface BridgeConnection {
	client: Client;
	config: BridgeConfig;
	connected: boolean;
}

export class McpBridge {
	private connections = new Map<ExternalTarget, BridgeConnection>();
	private configs: Record<string, BridgeConfig>;

	constructor(configs: Partial<Record<ExternalTarget, BridgeConfig>> = {}) {
		this.configs = { ...DEFAULT_BRIDGE_CONFIGS, ...configs };
	}

	/**
	 * Connect to an external CAD application's MCP server.
	 */
	async connect(target: ExternalTarget): Promise<void> {
		if (this.connections.has(target)) {
			const conn = this.connections.get(target);
			if (conn?.connected) return;
		}

		const config = this.configs[target];
		if (!config) {
			throw new Error(`No configuration for target: ${target}`);
		}

		const client = new Client(
			{ name: `ai-cad-bridge-${target}`, version: "1.0.0" },
			{ capabilities: {} },
		);

		let transport: StdioClientTransport | SSEClientTransport;

		if (config.transport === "stdio") {
			if (!config.command) {
				throw new Error(`No command configured for ${target}`);
			}
			transport = new StdioClientTransport({
				command: config.command,
				args: config.args || [],
			});
		} else {
			if (!config.url) {
				throw new Error(`No URL configured for ${target}`);
			}
			transport = new SSEClientTransport(new URL(config.url));
		}

		await client.connect(transport);

		this.connections.set(target, {
			client,
			config,
			connected: true,
		});
	}

	/**
	 * Disconnect from an external MCP server.
	 */
	async disconnect(target: ExternalTarget): Promise<void> {
		const conn = this.connections.get(target);
		if (!conn) return;

		await conn.client.close();
		conn.connected = false;
		this.connections.delete(target);
	}

	/**
	 * List available tools on an external MCP server.
	 */
	async listTools(target: ExternalTarget): Promise<
		{
			name: string;
			description?: string;
		}[]
	> {
		const conn = this.getConnection(target);
		const result = await conn.client.listTools();
		return result.tools.map((t) => ({
			name: t.name,
			description: t.description,
		}));
	}

	/**
	 * Call a tool on an external MCP server.
	 */
	async callTool(
		target: ExternalTarget,
		toolName: string,
		args: Record<string, unknown>,
	): Promise<unknown> {
		const conn = this.getConnection(target);
		const result = await conn.client.callTool({
			name: toolName,
			arguments: args,
		});
		return result;
	}

	/**
	 * Send a model to an external CAD application.
	 *
	 * Flow:
	 * 1. Export model from AI-CAD in the preferred format
	 * 2. Base64-encode the data
	 * 3. Call the external server's import tool
	 */
	async sendModel(
		target: ExternalTarget,
		modelData: ArrayBuffer,
		filename: string,
		format?: string,
	): Promise<{ success: boolean; message: string }> {
		const conn = this.getConnection(target);
		const exportFormat = format || conn.config.preferredFormat;

		// Convert to base64
		const base64 = arrayBufferToBase64(modelData);

		// Try common import tool names
		const importToolNames = [
			"import_model",
			"import_file",
			"open_file",
			"load_model",
		];

		for (const toolName of importToolNames) {
			try {
				await conn.client.callTool({
					name: toolName,
					arguments: {
						data: base64,
						format: exportFormat,
						filename: `${filename}.${exportFormat}`,
					},
				});
				return {
					success: true,
					message: `Model sent to ${target} via ${toolName}`,
				};
			} catch {
				// Try next tool name
			}
		}

		return {
			success: false,
			message: `No compatible import tool found on ${target} MCP server`,
		};
	}

	/**
	 * Receive a model from an external CAD application.
	 *
	 * Flow:
	 * 1. Call the external server's export tool
	 * 2. Receive base64-encoded data
	 * 3. Decode and return as ArrayBuffer
	 */
	async receiveModel(
		target: ExternalTarget,
		format?: string,
	): Promise<{
		data: ArrayBuffer;
		format: string;
		filename: string;
	}> {
		const conn = this.getConnection(target);
		const exportFormat = format || conn.config.preferredFormat;

		// Try common export tool names
		const exportToolNames = [
			"export_model",
			"export_file",
			"save_file",
			"get_model",
		];

		for (const toolName of exportToolNames) {
			try {
				const result = (await conn.client.callTool({
					name: toolName,
					arguments: { format: exportFormat },
				})) as {
					content: { type: string; text?: string }[];
				};

				const textContent = result.content?.find(
					(c) => c.type === "text" && c.text,
				);
				if (textContent?.text) {
					const parsed = JSON.parse(textContent.text);
					if (parsed.data) {
						return {
							data: base64ToArrayBuffer(parsed.data),
							format: exportFormat,
							filename: parsed.filename || `import.${exportFormat}`,
						};
					}
				}
			} catch {
				// Try next tool name
			}
		}

		throw new Error(`No compatible export tool found on ${target} MCP server`);
	}

	/**
	 * Sync model bidirectionally — export from AI-CAD, import to target,
	 * and vice versa.
	 */
	async syncModel(
		target: ExternalTarget,
		direction: "push" | "pull",
		modelData?: ArrayBuffer,
		filename = "model",
	): Promise<{ success: boolean; message: string; data?: ArrayBuffer }> {
		if (direction === "push") {
			if (!modelData) {
				return { success: false, message: "No model data to push" };
			}
			return this.sendModel(target, modelData, filename);
		}

		try {
			const result = await this.receiveModel(target);
			return {
				success: true,
				message: `Model received from ${target}`,
				data: result.data,
			};
		} catch (err) {
			return {
				success: false,
				message:
					err instanceof Error
						? err.message
						: `Failed to receive from ${target}`,
			};
		}
	}

	/**
	 * Get connection status for all targets.
	 */
	getStatus(): Record<ExternalTarget, { connected: boolean; format: string }> {
		const status: Record<string, { connected: boolean; format: string }> = {};
		for (const [target, config] of Object.entries(this.configs)) {
			const conn = this.connections.get(target as ExternalTarget);
			status[target] = {
				connected: conn?.connected || false,
				format: config.preferredFormat,
			};
		}
		return status as Record<
			ExternalTarget,
			{ connected: boolean; format: string }
		>;
	}

	private getConnection(target: ExternalTarget): BridgeConnection {
		const conn = this.connections.get(target);
		if (!conn || !conn.connected) {
			throw new Error(`Not connected to ${target}. Call connect() first.`);
		}
		return conn;
	}
}

// ─── Utilities ───────────────────────────────────────────────────

function arrayBufferToBase64(buffer: ArrayBuffer): string {
	const bytes = new Uint8Array(buffer);
	let binary = "";
	for (let i = 0; i < bytes.byteLength; i++) {
		binary += String.fromCharCode(bytes[i]);
	}
	return btoa(binary);
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
	const binary = atob(base64);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) {
		bytes[i] = binary.charCodeAt(i);
	}
	return bytes.buffer;
}

// ─── Singleton ───────────────────────────────────────────────────

let bridgeInstance: McpBridge | null = null;

export function getMcpBridge(
	configs?: Partial<Record<ExternalTarget, BridgeConfig>>,
): McpBridge {
	if (!bridgeInstance) {
		bridgeInstance = new McpBridge(configs);
	}
	return bridgeInstance;
}
