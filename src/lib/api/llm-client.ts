/**
 * LLM API Client — Provider-agnostic interface for chat completions.
 *
 * Supports OpenAI-compatible APIs (OpenAI, Azure OpenAI, Ollama, LM Studio, etc.)
 * and Anthropic's Messages API. Configurable via settings UI or environment variables.
 */

import { useLlmStore } from "@/lib/store/llm-store";

export interface LlmMessage {
	role: "system" | "user" | "assistant";
	content: string;
}

export interface LlmStreamChunk {
	content: string;
	done: boolean;
}

export type LlmProvider = "openai" | "anthropic";

export interface LlmConfig {
	provider: LlmProvider;
	apiKey: string;
	baseUrl: string;
	model: string;
	maxTokens: number;
	temperature: number;
}

function getConfig(): LlmConfig {
	const store = useLlmStore.getState();

	const provider = store.provider || "openai";
	const apiKey =
		store.apiKey ||
		import.meta.env.VITE_LLM_API_KEY ||
		import.meta.env.VITE_OPENAI_API_KEY ||
		import.meta.env.VITE_ANTHROPIC_API_KEY ||
		"";
	const model =
		store.model ||
		import.meta.env.VITE_LLM_MODEL ||
		(provider === "anthropic" ? "claude-sonnet-4-20250514" : "gpt-4o");
	const baseUrl =
		store.baseUrl ||
		import.meta.env.VITE_LLM_BASE_URL ||
		(provider === "anthropic"
			? "https://api.anthropic.com"
			: "https://api.openai.com");

	return {
		provider,
		apiKey,
		baseUrl,
		model,
		maxTokens: store.maxTokens || 4096,
		temperature: store.temperature ?? 0.3,
	};
}

/**
 * Stream a chat completion from the configured LLM provider.
 * Yields content chunks as they arrive.
 */
export async function* streamChat(
	messages: LlmMessage[],
): AsyncGenerator<LlmStreamChunk> {
	const config = getConfig();

	if (!config.apiKey) {
		throw new Error(
			"LLM API key not configured. Set it in Settings or via VITE_LLM_API_KEY environment variable.",
		);
	}

	if (config.provider === "anthropic") {
		yield* streamAnthropic(config, messages);
	} else {
		yield* streamOpenAI(config, messages);
	}
}

/**
 * Non-streaming chat completion — returns full response.
 */
export async function chat(messages: LlmMessage[]): Promise<string> {
	let result = "";
	for await (const chunk of streamChat(messages)) {
		result += chunk.content;
	}
	return result;
}

async function* streamOpenAI(
	config: LlmConfig,
	messages: LlmMessage[],
): AsyncGenerator<LlmStreamChunk> {
	const response = await fetch(`${config.baseUrl}/v1/chat/completions`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${config.apiKey}`,
		},
		body: JSON.stringify({
			model: config.model,
			messages,
			max_tokens: config.maxTokens,
			temperature: config.temperature,
			stream: true,
		}),
	});

	if (!response.ok) {
		const body = await response.text();
		throw new Error(`LLM API error (${response.status}): ${body}`);
	}

	const reader = response.body?.getReader();
	if (!reader) throw new Error("No response body");

	const decoder = new TextDecoder();
	let buffer = "";

	while (true) {
		const { done, value } = await reader.read();
		if (done) break;

		buffer += decoder.decode(value, { stream: true });
		const lines = buffer.split("\n");
		buffer = lines.pop() || "";

		for (const line of lines) {
			const trimmed = line.trim();
			if (!trimmed || !trimmed.startsWith("data: ")) continue;
			const data = trimmed.slice(6);
			if (data === "[DONE]") {
				yield { content: "", done: true };
				return;
			}
			try {
				const parsed = JSON.parse(data);
				const content = parsed.choices?.[0]?.delta?.content || "";
				if (content) {
					yield { content, done: false };
				}
			} catch {
				// Skip malformed JSON lines
			}
		}
	}
	yield { content: "", done: true };
}

async function* streamAnthropic(
	config: LlmConfig,
	messages: LlmMessage[],
): AsyncGenerator<LlmStreamChunk> {
	// Anthropic requires system message to be separate
	const systemMessage = messages.find((m) => m.role === "system");
	const chatMessages = messages
		.filter((m) => m.role !== "system")
		.map((m) => ({ role: m.role, content: m.content }));

	const response = await fetch(`${config.baseUrl}/v1/messages`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"x-api-key": config.apiKey,
			"anthropic-version": "2023-06-01",
			"anthropic-dangerous-direct-browser-access": "true",
		},
		body: JSON.stringify({
			model: config.model,
			max_tokens: config.maxTokens,
			temperature: config.temperature,
			system: systemMessage?.content || "",
			messages: chatMessages,
			stream: true,
		}),
	});

	if (!response.ok) {
		const body = await response.text();
		throw new Error(`Anthropic API error (${response.status}): ${body}`);
	}

	const reader = response.body?.getReader();
	if (!reader) throw new Error("No response body");

	const decoder = new TextDecoder();
	let buffer = "";

	while (true) {
		const { done, value } = await reader.read();
		if (done) break;

		buffer += decoder.decode(value, { stream: true });
		const lines = buffer.split("\n");
		buffer = lines.pop() || "";

		for (const line of lines) {
			const trimmed = line.trim();
			if (!trimmed || !trimmed.startsWith("data: ")) continue;
			const data = trimmed.slice(6);
			try {
				const parsed = JSON.parse(data);
				if (parsed.type === "content_block_delta") {
					const content = parsed.delta?.text || "";
					if (content) {
						yield { content, done: false };
					}
				}
				if (parsed.type === "message_stop") {
					yield { content: "", done: true };
					return;
				}
			} catch {
				// Skip malformed lines
			}
		}
	}
	yield { content: "", done: true };
}
