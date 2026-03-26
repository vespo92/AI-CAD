import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
	component: IndexPage,
});

function IndexPage() {
	// The main CAD workspace is rendered by the Layout in __root.tsx
	// This index route exists for TanStack Router completeness
	return null;
}
