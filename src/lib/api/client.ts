export class ApiError extends Error {
	constructor(
		public status: number,
		public statusText: string,
		message: string,
	) {
		super(message);
		this.name = "ApiError";
	}
}

async function getAuthHeader(): Promise<Record<string, string>> {
	// Auth headers are added when Azure AD integration is enabled.
	// For now, return empty headers (works for unauthenticated backends).
	return {};
}

export async function apiFetch<T>(
	url: string,
	options: RequestInit = {},
): Promise<T> {
	const authHeaders = await getAuthHeader();

	const response = await fetch(url, {
		...options,
		headers: {
			"Content-Type": "application/json",
			...authHeaders,
			...options.headers,
		},
	});

	if (!response.ok) {
		const text = await response.text();
		throw new ApiError(response.status, response.statusText, text);
	}

	return response.json();
}

export async function apiUpload<T>(
	url: string,
	formData: FormData,
): Promise<T> {
	const authHeaders = await getAuthHeader();

	const response = await fetch(url, {
		method: "POST",
		headers: {
			...authHeaders,
		},
		body: formData,
	});

	if (!response.ok) {
		const text = await response.text();
		throw new ApiError(response.status, response.statusText, text);
	}

	return response.json();
}

export const API_BASE = import.meta.env.VITE_API_BASE || "";

export const API_ENDPOINTS = {
	fileProxy: `${API_BASE}/api/file-proxy`,
	llmGateway: `${API_BASE}/api/llm-gateway`,
	cadService: `${API_BASE}/api/cad`,
} as const;
