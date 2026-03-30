import { useCadStore } from "@/lib/store/cad-store";
import { useLlmStore } from "@/lib/store/llm-store";
import { DEFAULT_VIEWPORT_SETTINGS } from "@/types/cad";
import { ArrowLeftIcon } from "@heroicons/react/24/outline";
import { Link, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/settings")({
	component: SettingsPage,
});

const MODEL_PRESETS = {
	openai: [
		{ label: "GPT-4o", value: "gpt-4o" },
		{ label: "GPT-4o Mini", value: "gpt-4o-mini" },
		{ label: "GPT-4 Turbo", value: "gpt-4-turbo" },
		{ label: "o3", value: "o3" },
		{ label: "o4-mini", value: "o4-mini" },
	],
	anthropic: [
		{ label: "Claude Sonnet 4", value: "claude-sonnet-4-20250514" },
		{ label: "Claude Opus 4", value: "claude-opus-4-20250514" },
		{ label: "Claude Haiku 3.5", value: "claude-haiku-4-5-20251001" },
	],
} as const;

function SettingsPage() {
	const viewportSettings = useCadStore((s) => s.viewportSettings);
	const setViewportSettings = useCadStore((s) => s.setViewportSettings);

	const provider = useLlmStore((s) => s.provider);
	const apiKey = useLlmStore((s) => s.apiKey);
	const model = useLlmStore((s) => s.model);
	const baseUrl = useLlmStore((s) => s.baseUrl);
	const maxTokens = useLlmStore((s) => s.maxTokens);
	const temperature = useLlmStore((s) => s.temperature);
	const setProvider = useLlmStore((s) => s.setProvider);
	const setApiKey = useLlmStore((s) => s.setApiKey);
	const setModel = useLlmStore((s) => s.setModel);
	const setBaseUrl = useLlmStore((s) => s.setBaseUrl);
	const setMaxTokens = useLlmStore((s) => s.setMaxTokens);
	const setTemperature = useLlmStore((s) => s.setTemperature);
	const resetLlm = useLlmStore((s) => s.reset);

	const presets = MODEL_PRESETS[provider] || MODEL_PRESETS.openai;

	return (
		<div className="min-h-screen bg-gray-900 p-6">
			<div className="max-w-2xl mx-auto space-y-6">
				<div className="flex items-center gap-3 mb-6">
					<Link to="/" className="btn-ghost p-2">
						<ArrowLeftIcon className="w-5 h-5" />
					</Link>
					<h1 className="text-xl font-bold text-white">Settings</h1>
				</div>

				{/* LLM Configuration */}
				<div className="card p-6 space-y-5">
					<h2 className="text-lg font-semibold text-white">LLM Provider</h2>

					<div className="space-y-1">
						<label
							htmlFor="llm-provider"
							className="text-sm font-medium text-gray-200"
						>
							Provider
						</label>
						<select
							id="llm-provider"
							value={provider}
							onChange={(e) => {
								setProvider(e.target.value as "openai" | "anthropic");
								setModel("");
							}}
							className="input w-full"
						>
							<option value="openai">OpenAI</option>
							<option value="anthropic">Anthropic</option>
						</select>
					</div>

					<div className="space-y-1">
						<label
							htmlFor="llm-api-key"
							className="text-sm font-medium text-gray-200"
						>
							API Key
						</label>
						<input
							id="llm-api-key"
							type="password"
							value={apiKey}
							onChange={(e) => setApiKey(e.target.value)}
							placeholder={provider === "anthropic" ? "sk-ant-..." : "sk-..."}
							className="input w-full font-mono"
						/>
						<p className="text-[10px] text-gray-600">
							Stored in memory only, not persisted to disk
						</p>
					</div>

					<div className="space-y-1">
						<label
							htmlFor="llm-model"
							className="text-sm font-medium text-gray-200"
						>
							Model
						</label>
						<div className="flex gap-2">
							<select
								id="llm-model"
								value={model}
								onChange={(e) => setModel(e.target.value)}
								className="input flex-1"
							>
								<option value="">Auto (default)</option>
								{presets.map((p) => (
									<option key={p.value} value={p.value}>
										{p.label}
									</option>
								))}
							</select>
							<input
								type="text"
								value={model}
								onChange={(e) => setModel(e.target.value)}
								placeholder="Or type custom model..."
								className="input flex-1 font-mono text-xs"
							/>
						</div>
					</div>

					<div className="space-y-1">
						<label
							htmlFor="llm-base-url"
							className="text-sm font-medium text-gray-200"
						>
							Base URL (optional)
						</label>
						<input
							id="llm-base-url"
							type="text"
							value={baseUrl}
							onChange={(e) => setBaseUrl(e.target.value)}
							placeholder={
								provider === "anthropic"
									? "https://api.anthropic.com"
									: "https://api.openai.com"
							}
							className="input w-full font-mono text-xs"
						/>
						<p className="text-[10px] text-gray-600">
							For Ollama, use http://localhost:11434
						</p>
					</div>

					<div className="grid grid-cols-2 gap-4">
						<div className="space-y-1">
							<label
								htmlFor="llm-max-tokens"
								className="text-sm font-medium text-gray-200"
							>
								Max Tokens
							</label>
							<input
								id="llm-max-tokens"
								type="number"
								value={maxTokens}
								onChange={(e) => setMaxTokens(Number(e.target.value))}
								min={256}
								max={128000}
								className="input w-full"
							/>
						</div>
						<div className="space-y-1">
							<label
								htmlFor="llm-temperature"
								className="text-sm font-medium text-gray-200"
							>
								Temperature
							</label>
							<input
								id="llm-temperature"
								type="number"
								value={temperature}
								onChange={(e) => setTemperature(Number(e.target.value))}
								min={0}
								max={2}
								step={0.1}
								className="input w-full"
							/>
						</div>
					</div>

					<div className="pt-2">
						<button type="button" onClick={resetLlm} className="btn-secondary">
							Reset to Defaults
						</button>
					</div>
				</div>

				{/* Viewport Settings */}
				<div className="card p-6 space-y-6">
					<h2 className="text-lg font-semibold text-white">Viewport</h2>

					<ToggleSetting
						label="Show Grid"
						description="Display the reference grid in the 3D viewport"
						checked={viewportSettings.showGrid}
						onChange={(v) => setViewportSettings({ showGrid: v })}
					/>

					<ToggleSetting
						label="Show Axes"
						description="Display X/Y/Z axis indicators"
						checked={viewportSettings.showAxes}
						onChange={(v) => setViewportSettings({ showAxes: v })}
					/>

					<ToggleSetting
						label="Show Edges"
						description="Render edges on solid bodies"
						checked={viewportSettings.showEdges}
						onChange={(v) => setViewportSettings({ showEdges: v })}
					/>

					<ToggleSetting
						label="Show Wireframe"
						description="Overlay wireframe on solid bodies"
						checked={viewportSettings.showWireframe}
						onChange={(v) => setViewportSettings({ showWireframe: v })}
					/>

					<div className="pt-4 border-t border-gray-700">
						<button
							type="button"
							onClick={() => setViewportSettings(DEFAULT_VIEWPORT_SETTINGS)}
							className="btn-secondary"
						>
							Reset to Defaults
						</button>
					</div>
				</div>

				{/* About */}
				<div className="card p-6 space-y-2">
					<h2 className="text-lg font-semibold text-white">About</h2>
					<p className="text-sm text-gray-400">
						AI-CAD v{import.meta.env.VITE_APP_VERSION || "0.2.0"} — Open-source
						AI-driven parametric CAD platform
					</p>
					<p className="text-xs text-gray-600">
						Replicad + OpenCASCADE WASM | Three.js | React 19
					</p>
				</div>
			</div>
		</div>
	);
}

function ToggleSetting({
	label,
	description,
	checked,
	onChange,
}: {
	label: string;
	description: string;
	checked: boolean;
	onChange: (value: boolean) => void;
}) {
	const inputId = `setting-${label.toLowerCase().replace(/\s+/g, "-")}`;

	return (
		<div className="flex items-center justify-between">
			<div>
				<label htmlFor={inputId} className="text-sm font-medium text-gray-200">
					{label}
				</label>
				<p className="text-xs text-gray-500">{description}</p>
			</div>
			<button
				type="button"
				id={inputId}
				role="switch"
				aria-checked={checked}
				onClick={() => onChange(!checked)}
				className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
					checked ? "bg-forge-600" : "bg-gray-600"
				}`}
			>
				<span
					className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
						checked ? "translate-x-6" : "translate-x-1"
					}`}
				/>
			</button>
		</div>
	);
}
