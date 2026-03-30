import type { ReactNode } from "react";

interface AuthProviderProps {
	children: ReactNode;
}

/**
 * Auth wrapper — passes children through directly.
 * Azure AD auth is optional and can be enabled by installing
 * @azure/msal-browser and @azure/msal-react separately.
 */
export function AuthProvider({ children }: AuthProviderProps) {
	return <>{children}</>;
}

export function useAuth() {
	return {
		isAuthenticated: false,
		user: null as { name: string; email: string } | null,
		logout: () => {},
		getAccessToken: async () => null as string | null,
	};
}
