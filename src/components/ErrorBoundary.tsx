import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
	children: ReactNode;
	fallback?: ReactNode;
}

interface State {
	hasError: boolean;
	error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
	constructor(props: Props) {
		super(props);
		this.state = { hasError: false, error: null };
	}

	static getDerivedStateFromError(error: Error): State {
		return { hasError: true, error };
	}

	componentDidCatch(error: Error, errorInfo: ErrorInfo) {
		console.error("ErrorBoundary caught:", error, errorInfo);
	}

	render() {
		if (this.state.hasError) {
			if (this.props.fallback) {
				return this.props.fallback;
			}

			return (
				<div className="min-h-screen flex items-center justify-center bg-gray-900">
					<div className="max-w-md w-full bg-gray-800 shadow-lg rounded-lg p-8">
						<div className="text-center">
							<div className="w-16 h-16 mx-auto mb-4 bg-red-900/30 rounded-full flex items-center justify-center">
								<svg
									className="w-8 h-8 text-red-400"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
									role="img"
									aria-label="Error"
								>
									<title>Error icon</title>
									<path
										strokeLinecap="round"
										strokeLinejoin="round"
										strokeWidth={2}
										d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
									/>
								</svg>
							</div>
							<h1 className="text-xl font-semibold text-white mb-2">
								Something went wrong
							</h1>
							<p className="text-gray-400 mb-4">
								An unexpected error occurred.
							</p>
							{this.state.error && (
								<pre className="text-left text-xs bg-gray-700 p-3 rounded overflow-auto max-h-32 mb-4 text-gray-300">
									{this.state.error.message}
								</pre>
							)}
							<button
								type="button"
								onClick={() => window.location.reload()}
								className="px-4 py-2 bg-forge-600 text-white rounded-lg hover:bg-forge-700 transition-colors"
							>
								Reload Page
							</button>
						</div>
					</div>
				</div>
			);
		}

		return this.props.children;
	}
}
