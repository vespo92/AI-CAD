import { useCadStore } from "@/lib/store/cad-store";
import { DEFAULT_VIEWPORT_SETTINGS } from "@/types/cad";
import { ArrowLeftIcon } from "@heroicons/react/24/outline";
import { Link, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/settings")({
	component: SettingsPage,
});

function SettingsPage() {
	const viewportSettings = useCadStore((s) => s.viewportSettings);
	const setViewportSettings = useCadStore((s) => s.setViewportSettings);

	return (
		<div className="min-h-screen bg-gray-900 p-6">
			<div className="max-w-2xl mx-auto">
				<div className="flex items-center gap-3 mb-6">
					<Link to="/" className="btn-ghost p-2">
						<ArrowLeftIcon className="w-5 h-5" />
					</Link>
					<h1 className="text-xl font-bold text-white">Settings</h1>
				</div>

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
