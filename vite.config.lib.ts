/**
 * Vite library-mode build config.
 *
 * Produces:
 *   dist/ai-cad.js      — ES module library bundle
 *   dist/cad-worker.js   — standalone Web Worker (copy to consumer's public/)
 *   dist/index.d.ts      — rolled-up type declarations
 *
 * Usage:  vite build --config vite.config.lib.ts
 */

import react from "@vitejs/plugin-react";
import path from "path";
import { defineConfig } from "vite";
import dts from "vite-plugin-dts";

export default defineConfig({
	plugins: [
		react({ jsxRuntime: "automatic" }),
		dts({
			include: [
				"src/index.ts",
				"src/lib/cad-engine/**",
				"src/hooks/**",
				"src/components/viewport/**",
				"src/lib/store/**",
				"src/lib/utils/**",
				"src/types/**",
			],
			rollupTypes: true,
		}),
	],
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "./src"),
		},
	},
	worker: {
		format: "es",
	},
	build: {
		lib: {
			entry: {
				"ai-cad": "src/index.ts",
				"cad-worker": "src/lib/cad-engine/worker.ts",
			},
			formats: ["es"],
		},
		outDir: "dist",
		sourcemap: true,
		// Don't clear dist/ — allows running alongside SPA build if needed
		emptyOutDir: true,
		rollupOptions: {
			external: [
				// Peer deps — consumer provides these
				"react",
				"react-dom",
				"react/jsx-runtime",
				"three",
				"@react-three/fiber",
				"@react-three/drei",
				// CAD kernel — consumer installs these; worker imports them at runtime
				"replicad",
				"replicad-opencascadejs",
				"replicad-opencascadejs/src/replicad_single.js",
				// State / utility libs the consumer may already have
				"zustand",
				"clsx",
				"tailwind-merge",
				"clsx/lite",
				// DXF parsing (used by engine.analyzeDxf)
				"dxf-parser",
			],
			output: {
				// Preserve the entry names so we get ai-cad.js and cad-worker.js
				entryFileNames: "[name].js",
				chunkFileNames: "chunks/[name]-[hash].js",
			},
		},
	},
});
