import { Layout } from "@/components/layout/Layout";
import { useCadEngine } from "@/hooks/use-cad-engine";
import { AuthProvider } from "@/lib/auth/AuthProvider";
import { initBrowserExecutor } from "@/lib/mcp/server";
import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/router-devtools";
import { useEffect } from "react";

interface RouterContext {
	queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterContext>()({
	component: RootComponent,
});

function RootComponent() {
	// Initialize CAD engine (loads WASM) as early as possible
	useCadEngine();

	// Initialize MCP browser executor so tools can drive the engine
	useEffect(() => {
		initBrowserExecutor().catch((err) => {
			console.warn("MCP browser executor init skipped:", err);
		});
	}, []);

	return (
		<AuthProvider>
			<Layout />
			{import.meta.env.DEV && (
				<TanStackRouterDevtools position="bottom-right" />
			)}
		</AuthProvider>
	);
}
