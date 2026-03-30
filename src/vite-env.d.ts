/// <reference types="vite/client" />
/// <reference types="@react-three/fiber" />

import type { ThreeElements } from "@react-three/fiber";

declare module "react" {
	namespace JSX {
		interface IntrinsicElements extends ThreeElements {}
	}
}

interface ImportMetaEnv {
	readonly VITE_AZURE_AD_CLIENT_ID: string;
	readonly VITE_AZURE_AD_TENANT_ID: string;
	readonly VITE_LLM_GATEWAY_URL: string;
	readonly VITE_CAD_SERVICE_URL: string;
	readonly VITE_FILE_SERVER_URL: string;
	readonly VITE_UPC_URL: string;
	readonly VITE_APP_VERSION: string;
	readonly VITE_LLM_PROVIDER: string;
	readonly VITE_LLM_API_KEY: string;
	readonly VITE_OPENAI_API_KEY: string;
	readonly VITE_ANTHROPIC_API_KEY: string;
	readonly VITE_LLM_MODEL: string;
	readonly VITE_LLM_BASE_URL: string;
	readonly VITE_LLM_MAX_TOKENS: string;
	readonly VITE_LLM_TEMPERATURE: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}
