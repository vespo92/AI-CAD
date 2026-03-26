import {
	type Configuration,
	LogLevel,
	PublicClientApplication,
} from "@azure/msal-browser";

const clientId = import.meta.env.VITE_AZURE_AD_CLIENT_ID || "";
const tenantId = import.meta.env.VITE_AZURE_AD_TENANT_ID || "";

export const msalConfig: Configuration = {
	auth: {
		clientId,
		authority: `https://login.microsoftonline.com/${tenantId}`,
		redirectUri: typeof window !== "undefined" ? window.location.origin : "",
		postLogoutRedirectUri:
			typeof window !== "undefined" ? window.location.origin : "",
		navigateToLoginRequestUrl: true,
	},
	cache: {
		cacheLocation: "sessionStorage",
		storeAuthStateInCookie: false,
	},
	system: {
		loggerOptions: {
			loggerCallback: (level, message, containsPii) => {
				if (containsPii) return;
				switch (level) {
					case LogLevel.Error:
						console.error(message);
						break;
					case LogLevel.Warning:
						console.warn(message);
						break;
					case LogLevel.Info:
						console.info(message);
						break;
					case LogLevel.Verbose:
						console.debug(message);
						break;
				}
			},
			logLevel: LogLevel.Warning,
		},
	},
};

export const loginRequest = {
	scopes: ["User.Read", "openid", "profile", "email"],
};

export const msalInstance = new PublicClientApplication(msalConfig);

msalInstance.initialize().then(() => {
	msalInstance.handleRedirectPromise().catch((error) => {
		console.error("Redirect error:", error);
	});
});
