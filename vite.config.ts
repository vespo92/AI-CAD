import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [TanStackRouterVite(), react()],
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "./src"),
		},
	},
	server: {
		port: 5176,
		host: true,
		headers: {
			"Cross-Origin-Opener-Policy": "same-origin",
			"Cross-Origin-Embedder-Policy": "require-corp",
		},
		proxy: {
			"/api/cad": {
				target: "http://localhost:8090",
				changeOrigin: true,
			},
			"/api/file-proxy": {
				target: "http://localhost:8091",
				changeOrigin: true,
			},
			"/api/llm-gateway": {
				target: "http://localhost:8092",
				changeOrigin: true,
			},
		},
	},
	worker: {
		format: "es",
	},
	optimizeDeps: {
		exclude: ["replicad", "replicad-opencascadejs"],
	},
	assetsInclude: ["**/*.wasm"],
	build: {
		outDir: "dist",
		sourcemap: true,
		rollupOptions: {
			output: {
				manualChunks: {
					"vendor-react": ["react", "react-dom"],
					"vendor-tanstack": [
						"@tanstack/react-query",
						"@tanstack/react-router",
					],
					"vendor-three": ["three", "@react-three/fiber", "@react-three/drei"],
					"vendor-monaco": ["@monaco-editor/react"],
				},
			},
		},
	},
});
