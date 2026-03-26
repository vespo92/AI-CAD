import { getEngineHealth, getStats, listJobs } from "@/lib/api/cad-service";
import {
	cancelJob as cancelJobApi,
	getJobStatus,
	startConversion,
} from "@/lib/api/cad-service";
import { listCadFiles, listDirectory } from "@/lib/api/file-server";
import { analyzeFile, enhanceConversion } from "@/lib/api/llm-gateway";
import type { ConversionRequest, LlmEnhanceRequest } from "@/types/cad";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export function useDirectoryListing(path: string) {
	return useQuery({
		queryKey: ["directory", path],
		queryFn: () => listDirectory(path),
		enabled: !!path,
	});
}

export function useCadFiles(path: string) {
	return useQuery({
		queryKey: ["cadFiles", path],
		queryFn: () => listCadFiles(path),
		enabled: !!path,
	});
}

export function useConversionJobs() {
	return useQuery({
		queryKey: ["conversionJobs"],
		queryFn: listJobs,
		refetchInterval: 5000,
	});
}

export function useJobStatus(jobId: string | null) {
	return useQuery({
		queryKey: ["jobStatus", jobId],
		queryFn: () => getJobStatus(jobId!),
		enabled: !!jobId,
		refetchInterval: (query) => {
			const status = query.state.data?.status;
			if (status === "completed" || status === "failed") return false;
			return 2000;
		},
	});
}

export function useEngineHealth() {
	return useQuery({
		queryKey: ["engineHealth"],
		queryFn: getEngineHealth,
		staleTime: 30000,
	});
}

export function useConversionStats() {
	return useQuery({
		queryKey: ["conversionStats"],
		queryFn: getStats,
	});
}

export function useStartConversion() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (request: ConversionRequest) => startConversion(request),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["conversionJobs"] });
		},
	});
}

export function useCancelJob() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (jobId: string) => cancelJobApi(jobId),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["conversionJobs"] });
		},
	});
}

export function useLlmEnhance() {
	return useMutation({
		mutationFn: (request: LlmEnhanceRequest) => enhanceConversion(request),
	});
}

export function useFileAnalysis(filePath: string | null) {
	return useQuery({
		queryKey: ["fileAnalysis", filePath],
		queryFn: () => analyzeFile(filePath!),
		enabled: !!filePath,
	});
}
