import { ErrorBoundary } from "@/components/ErrorBoundary";
import { msalInstance } from "@/lib/auth/msal-config";
import { MsalProvider } from "@azure/msal-react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { RouterProvider, createRouter } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { routeTree } from "./routeTree.gen";
import "./index.css";

const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			staleTime: 1000 * 60,
			gcTime: 1000 * 60 * 5,
			refetchOnWindowFocus: false,
			retry: 1,
		},
	},
});

const router = createRouter({
	routeTree,
	context: {
		queryClient,
	},
	defaultPreload: "intent",
	defaultPreloadStaleTime: 0,
});

declare module "@tanstack/react-router" {
	interface Register {
		router: typeof router;
	}
}

const rootElement = document.getElementById("root") as HTMLElement;
if (!rootElement.innerHTML) {
	const root = createRoot(rootElement);
	root.render(
		<StrictMode>
			<ErrorBoundary>
				<MsalProvider instance={msalInstance}>
					<QueryClientProvider client={queryClient}>
						<RouterProvider router={router} />
						<ReactQueryDevtools initialIsOpen={false} />
					</QueryClientProvider>
				</MsalProvider>
			</ErrorBoundary>
		</StrictMode>,
	);
}
