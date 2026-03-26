import type { ConversionJob, ConversionRequest } from "@/types/cad";
import { API_ENDPOINTS, apiFetch } from "./client";

export async function startConversion(
	request: ConversionRequest,
): Promise<ConversionJob> {
	return apiFetch<ConversionJob>(`${API_ENDPOINTS.cadService}/convert`, {
		method: "POST",
		body: JSON.stringify(request),
	});
}

export async function getJobStatus(jobId: string): Promise<ConversionJob> {
	return apiFetch<ConversionJob>(
		`${API_ENDPOINTS.cadService}/jobs/${encodeURIComponent(jobId)}`,
	);
}

export async function listJobs(): Promise<ConversionJob[]> {
	return apiFetch<ConversionJob[]>(`${API_ENDPOINTS.cadService}/jobs`);
}

export async function cancelJob(jobId: string): Promise<void> {
	await apiFetch<void>(
		`${API_ENDPOINTS.cadService}/jobs/${encodeURIComponent(jobId)}/cancel`,
		{ method: "POST" },
	);
}

export async function getEngineHealth(): Promise<
	Record<string, { available: boolean; version: string }>
> {
	return apiFetch<Record<string, { available: boolean; version: string }>>(
		`${API_ENDPOINTS.cadService}/engines/health`,
	);
}

export interface ConversionStats {
	totalJobs: number;
	completedJobs: number;
	failedJobs: number;
	activeJobs: number;
	averageDuration: number;
	byEngine: Record<string, number>;
	byFormat: Record<string, number>;
}

export async function getStats(): Promise<ConversionStats> {
	return apiFetch<ConversionStats>(`${API_ENDPOINTS.cadService}/stats`);
}
