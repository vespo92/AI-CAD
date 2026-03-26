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
	readonly VITE_APP_VERSION: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}
