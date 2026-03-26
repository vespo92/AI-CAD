import type { CadFile, CadFormat, FileServerEntry } from "@/types/cad";
import { API_ENDPOINTS, apiFetch, apiUpload } from "./client";

const CAD_EXTENSIONS = new Set([
	"scad",
	"step",
	"stp",
	"iges",
	"igs",
	"stl",
	"obj",
	"fbx",
	"gltf",
	"glb",
	"usd",
	"usda",
	"usdc",
	"usdz",
	"3mf",
	"dxf",
	"brep",
	"fcstd",
]);

export async function listDirectory(path: string): Promise<FileServerEntry[]> {
	return apiFetch<FileServerEntry[]>(
		`${API_ENDPOINTS.fileProxy}/browse?path=${encodeURIComponent(path)}`,
	);
}

export async function listCadFiles(path: string): Promise<CadFile[]> {
	const entries = await listDirectory(path);
	return entries
		.filter(
			(entry) =>
				entry.type === "file" &&
				entry.extension &&
				CAD_EXTENSIONS.has(entry.extension.toLowerCase()),
		)
		.map((entry) => ({
			id: entry.path,
			name: entry.name,
			path: entry.path,
			format: (entry.extension?.toLowerCase() || "stl") as CadFormat,
			size: entry.size,
			lastModified: entry.lastModified,
		}));
}

export async function getFileMetadata(path: string): Promise<FileServerEntry> {
	return apiFetch<FileServerEntry>(
		`${API_ENDPOINTS.fileProxy}/info?path=${encodeURIComponent(path)}`,
	);
}

export async function uploadFile(
	file: File,
	destinationPath: string,
): Promise<FileServerEntry> {
	const formData = new FormData();
	formData.append("file", file);
	formData.append("path", destinationPath);
	return apiUpload<FileServerEntry>(
		`${API_ENDPOINTS.fileProxy}/upload`,
		formData,
	);
}

export function getDownloadUrl(path: string): string {
	return `${API_ENDPOINTS.fileProxy}/download?path=${encodeURIComponent(path)}`;
}

export function getThumbnailUrl(path: string): string {
	return `${API_ENDPOINTS.fileProxy}/thumbnail?path=${encodeURIComponent(path)}`;
}
