import { InteractionStatus } from "@azure/msal-browser";
import {
	AuthenticatedTemplate,
	UnauthenticatedTemplate,
	useMsal,
} from "@azure/msal-react";
import type { ReactNode } from "react";
import { loginRequest } from "./msal-config";

interface AuthProviderProps {
	children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
	return (
		<>
			<AuthenticatedTemplate>{children}</AuthenticatedTemplate>
			<UnauthenticatedTemplate>
				<LoginScreen />
			</UnauthenticatedTemplate>
		</>
	);
}

function LoginScreen() {
	const { instance, inProgress } = useMsal();

	const handleLogin = () => {
		instance.loginRedirect(loginRequest).catch((error) => {
			console.error("Login error:", error);
		});
	};

	if (inProgress !== InteractionStatus.None) {
		return (
			<div className="min-h-screen flex items-center justify-center bg-gray-900">
				<div className="text-center">
					<div className="animate-spin rounded-full h-12 w-12 border-b-2 border-forge-500 mx-auto" />
					<p className="mt-4 text-gray-400">Authenticating...</p>
				</div>
			</div>
		);
	}

	return (
		<div className="min-h-screen flex items-center justify-center bg-gray-900">
			<div className="max-w-md w-full space-y-8 p-8">
				<div className="text-center">
					<div className="w-16 h-16 mx-auto mb-6 bg-forge-500/10 rounded-2xl flex items-center justify-center">
						<svg
							className="w-10 h-10 text-forge-500"
							viewBox="0 0 64 64"
							fill="none"
							xmlns="http://www.w3.org/2000/svg"
							role="img"
							aria-label="AI-CAD Logo"
						>
							<title>AI-CAD Logo</title>
							<path
								d="M16 48 L32 12 L48 48 Z"
								stroke="currentColor"
								strokeWidth="3"
								fill="none"
								strokeLinejoin="round"
							/>
							<circle
								cx="32"
								cy="32"
								r="8"
								stroke="currentColor"
								strokeWidth="2"
								fill="none"
							/>
						</svg>
					</div>
					<h1 className="text-3xl font-bold text-white">AI-CAD</h1>
					<p className="mt-2 text-gray-400">
						AI-driven parametric CAD platform
					</p>
				</div>
				<button
					type="button"
					onClick={handleLogin}
					className="btn-primary w-full py-3"
				>
					Sign in with Microsoft
				</button>
			</div>
		</div>
	);
}

export function useAuth() {
	const { instance, accounts } = useMsal();
	const account = accounts[0];

	const logout = () => {
		instance.logoutRedirect({
			postLogoutRedirectUri: window.location.origin,
		});
	};

	const getAccessToken = async () => {
		if (!account) return null;
		try {
			const response = await instance.acquireTokenSilent({
				scopes: ["User.Read"],
				account,
			});
			return response.accessToken;
		} catch (error) {
			console.error("Token acquisition error:", error);
			return null;
		}
	};

	return {
		isAuthenticated: !!account,
		user: account
			? {
					name: account.name || "",
					email: account.username || "",
				}
			: null,
		logout,
		getAccessToken,
	};
}
