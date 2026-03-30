import type { LlmProvider } from "@/lib/api/llm-client";
import { create } from "zustand";
import { persist } from "zustand/middleware";

interface LlmSettings {
	provider: LlmProvider;
	apiKey: string;
	model: string;
	baseUrl: string;
	maxTokens: number;
	temperature: number;
}

interface LlmSettingsState extends LlmSettings {
	setProvider: (provider: LlmProvider) => void;
	setApiKey: (key: string) => void;
	setModel: (model: string) => void;
	setBaseUrl: (url: string) => void;
	setMaxTokens: (tokens: number) => void;
	setTemperature: (temp: number) => void;
	reset: () => void;
}

const defaults: LlmSettings = {
	provider: (import.meta.env.VITE_LLM_PROVIDER as LlmProvider) || "openai",
	apiKey:
		import.meta.env.VITE_LLM_API_KEY ||
		import.meta.env.VITE_OPENAI_API_KEY ||
		import.meta.env.VITE_ANTHROPIC_API_KEY ||
		"",
	model: import.meta.env.VITE_LLM_MODEL || "",
	baseUrl: import.meta.env.VITE_LLM_BASE_URL || "",
	maxTokens: Number(import.meta.env.VITE_LLM_MAX_TOKENS) || 4096,
	temperature: Number(import.meta.env.VITE_LLM_TEMPERATURE) || 0.3,
};

export const useLlmStore = create<LlmSettingsState>()(
	persist(
		(set) => ({
			...defaults,

			setProvider: (provider) => set({ provider }),
			setApiKey: (apiKey) => set({ apiKey }),
			setModel: (model) => set({ model }),
			setBaseUrl: (baseUrl) => set({ baseUrl }),
			setMaxTokens: (maxTokens) => set({ maxTokens }),
			setTemperature: (temperature) => set({ temperature }),
			reset: () => set(defaults),
		}),
		{
			name: "ai-cad-llm-settings",
			partialize: (state) => ({
				provider: state.provider,
				model: state.model,
				baseUrl: state.baseUrl,
				maxTokens: state.maxTokens,
				temperature: state.temperature,
				// Never persist API keys to localStorage
			}),
		},
	),
);
