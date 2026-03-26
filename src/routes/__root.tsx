import { Layout } from "@/components/layout/Layout";
import { useCadEngine } from "@/hooks/use-cad-engine";
import { AuthProvider } from "@/lib/auth/AuthProvider";
import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/router-devtools";

interface RouterContext {
	queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterContext>()({
	component: RootComponent,
});

function RootComponent() {
	// Initialize CAD engine (loads WASM) as early as possible
	useCadEngine();

	return (
		<AuthProvider>
			<Layout />
			{import.meta.env.DEV && (
				<TanStackRouterDevtools position="bottom-right" />
			)}
		</AuthProvider>
	);
}
