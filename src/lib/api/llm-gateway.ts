import type {
	CadFormat,
	ConversionOptions,
	LlmEnhanceRequest,
	LlmEnhanceResponse,
} from "@/types/cad";
import { API_ENDPOINTS, apiFetch } from "./client";

export async function enhanceConversion(
	request: LlmEnhanceRequest,
): Promise<LlmEnhanceResponse> {
	return apiFetch<LlmEnhanceResponse>(
		`${API_ENDPOINTS.llmGateway}/cad/enhance`,
		{
			method: "POST",
			body: JSON.stringify(request),
		},
	);
}

export async function suggestOptimalSettings(
	sourceFormat: CadFormat,
	targetFormat: CadFormat,
	fileSize: number,
): Promise<ConversionOptions> {
	return apiFetch<ConversionOptions>(
		`${API_ENDPOINTS.llmGateway}/cad/suggest-settings`,
		{
			method: "POST",
			body: JSON.stringify({ sourceFormat, targetFormat, fileSize }),
		},
	);
}

export async function analyzeFile(filePath: string): Promise<{
	description: string;
	complexity: "simple" | "moderate" | "complex";
	suggestedEngines: string[];
	warnings: string[];
}> {
	return apiFetch(`${API_ENDPOINTS.llmGateway}/cad/analyze`, {
		method: "POST",
		body: JSON.stringify({ filePath }),
	});
}
