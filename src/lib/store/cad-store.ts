import {
	createDefaultFeature,
	createDefaultStructure,
} from "@/lib/cad-engine/feature-codegen";
import {
	type Assembly,
	type CadModel,
	type ChatMessage,
	DEFAULT_VIEWPORT_SETTINGS,
	type Feature,
	type FeatureType,
	type MeshData,
	type SketchPlane,
	type ViewportSettings,
} from "@/types/cad";
import { create } from "zustand";
import { history } from "./history";

/**
 * PropertyManager state — tracks which feature is currently being edited
 * via the property panel (SolidWorks-style PropertyManager). When set, the
 * PropertyManager panel is visible and the user is editing that feature's params.
 */
export interface PropertyManagerState {
	featureId: string;
	/** If this is a newly-created feature we haven't confirmed yet,
	 * cancelling will remove it from the tree. Otherwise cancel reverts edits. */
	isNew: boolean;
	/** Snapshot of original params for cancel-revert */
	originalParams?: Record<string, unknown>;
}

/**
 * Sketch workflow state — tracks what stage of sketch creation we're in.
 * idle          → no sketch in progress
 * picking-plane → user clicked New Sketch, waiting for them to pick a plane
 * editing       → inside a sketch, drawing entities
 */
export interface SketchWorkflowState {
	stage: "idle" | "picking-plane" | "editing";
	/** Which plane the sketch is on (once picked) */
	plane?: SketchPlane;
	/** Which feature id this sketch belongs to (the "Sketch" feature) */
	featureId?: string;
}

interface CadState {
	// Model state
	model: CadModel;
	meshData: MeshData | null;
	isEngineReady: boolean;
	isProcessing: boolean;

	// Assembly state
	assembly: Assembly;

	// UI state
	selectedFeatureId: string | null;
	selectedFaceIndex: number | null;
	viewportSettings: ViewportSettings;
	leftPanelWidth: number;
	rightPanelWidth: number;
	bottomPanelHeight: number;
	activeBottomTab: "chat" | "code" | "console";
	activeLeftTab: "features" | "parts" | "assembly" | "splicer" | "macros";
	activeRightTab: "export" | "jobs" | "properties";
	rightPanelOpen: boolean;
	viewMode: "3d" | "sketch";

	// Workflow state — SolidWorks-style PropertyManager + sketch creation
	propertyManager: PropertyManagerState | null;
	sketchWorkflow: SketchWorkflowState;

	// History state
	canUndo: boolean;
	canRedo: boolean;

	// Chat state
	chatMessages: ChatMessage[];
	isChatLoading: boolean;

	// Code editor state
	editorCode: string;

	// Actions
	setModel: (model: CadModel) => void;
	setMeshData: (mesh: MeshData | null) => void;
	setEngineReady: (ready: boolean) => void;
	setProcessing: (processing: boolean) => void;

	addFeature: (feature: Feature) => void;
	removeFeature: (id: string) => void;
	updateFeature: (id: string, updates: Partial<Feature>) => void;
	toggleFeatureVisibility: (id: string) => void;
	selectFeature: (id: string | null) => void;
	selectFace: (index: number | null) => void;

	setViewportSettings: (settings: Partial<ViewportSettings>) => void;
	setLeftPanelWidth: (width: number) => void;
	setRightPanelWidth: (width: number) => void;
	setBottomPanelHeight: (height: number) => void;
	setActiveBottomTab: (tab: "chat" | "code" | "console") => void;
	setActiveLeftTab: (
		tab: "features" | "parts" | "assembly" | "splicer" | "macros",
	) => void;
	setActiveRightTab: (tab: "export" | "jobs" | "properties") => void;
	toggleRightPanel: () => void;
	setRightPanelOpen: (open: boolean) => void;
	setViewMode: (mode: "3d" | "sketch") => void;

	// PropertyManager — open/close the right-side property panel for a feature
	openPropertyManager: (featureId: string, isNew: boolean) => void;
	closePropertyManager: (commit: boolean) => void;
	updateEditingFeatureParams: (updates: Record<string, unknown>) => void;

	// Sketch workflow
	beginSketchWorkflow: () => void;
	pickSketchPlane: (plane: SketchPlane, planeFeatureId?: string) => void;
	finishSketch: (sketchData: Feature["sketchData"]) => string | null; // returns the sketch feature id
	cancelSketchWorkflow: () => void;
	/** Reset everything to a fresh model with default structure */
	newModel: (name?: string) => void;
	/** Insert a feature and optionally open the PropertyManager for it */
	insertFeature: (type: FeatureType, openPropertyManager?: boolean) => string;

	addChatMessage: (message: Omit<ChatMessage, "id" | "timestamp">) => void;
	setChatLoading: (loading: boolean) => void;
	clearChat: () => void;

	setEditorCode: (code: string) => void;

	// History actions
	pushHistory: (label: string) => void;
	undo: () => void;
	redo: () => void;

	// Assembly actions
	addAssemblyPart: (part: Assembly["parts"][number]) => void;
	removeAssemblyPart: (id: string) => void;
	addMate: (mate: Assembly["mates"][number]) => void;
	removeMate: (id: string) => void;
}

const createEmptyModel = (name = "Untitled Model"): CadModel => ({
	id: crypto.randomUUID(),
	name,
	features: createDefaultStructure(),
	activeFeatureIndex: -1,
});

const createEmptyAssembly = (): Assembly => ({
	id: crypto.randomUUID(),
	name: "Assembly",
	parts: [],
	mates: [],
});

export const useCadStore = create<CadState>((set, get) => ({
	// Initial state
	model: createEmptyModel(),
	meshData: null,
	isEngineReady: false,
	isProcessing: false,

	assembly: createEmptyAssembly(),

	selectedFeatureId: null,
	selectedFaceIndex: null,
	viewportSettings: DEFAULT_VIEWPORT_SETTINGS,
	leftPanelWidth: 260,
	rightPanelWidth: 320,
	bottomPanelHeight: 280,
	activeBottomTab: "chat",
	activeLeftTab: "features",
	activeRightTab: "export",
	rightPanelOpen: false,
	viewMode: "3d",

	propertyManager: null,
	sketchWorkflow: { stage: "idle" },

	canUndo: false,
	canRedo: false,

	chatMessages: [
		{
			id: "welcome",
			role: "system",
			content:
				"Welcome to AI-CAD. Describe what you want to build, or use the sketch tools to get started.",
			timestamp: Date.now(),
		},
	],
	isChatLoading: false,

	editorCode: `// AI-CAD — Replicad TypeScript
// Describe a shape or write code directly

import { drawRoundedRectangle } from "replicad";

// Example: Create a simple box with rounded edges
const shape = drawRoundedRectangle(40, 30, 5)
  .sketchOnPlane("XY")
  .extrude(15)
  .fillet(2, (e) => e.inDirection("Z"));

return shape;
`,

	// Model actions
	setModel: (model) => set({ model }),
	setMeshData: (meshData) => set({ meshData }),
	setEngineReady: (isEngineReady) => set({ isEngineReady }),
	setProcessing: (isProcessing) => set({ isProcessing }),

	addFeature: (feature) =>
		set((state) => ({
			model: {
				...state.model,
				features: [...state.model.features, feature],
				activeFeatureIndex: state.model.features.length,
			},
		})),

	removeFeature: (id) =>
		set((state) => ({
			model: {
				...state.model,
				features: state.model.features.filter((f) => f.id !== id),
				activeFeatureIndex: Math.min(
					state.model.activeFeatureIndex,
					state.model.features.length - 2,
				),
			},
			selectedFeatureId:
				state.selectedFeatureId === id ? null : state.selectedFeatureId,
		})),

	updateFeature: (id, updates) =>
		set((state) => ({
			model: {
				...state.model,
				features: state.model.features.map((f) =>
					f.id === id ? { ...f, ...updates } : f,
				),
			},
		})),

	toggleFeatureVisibility: (id) =>
		set((state) => ({
			model: {
				...state.model,
				features: state.model.features.map((f) =>
					f.id === id ? { ...f, visible: !f.visible } : f,
				),
			},
		})),

	selectFeature: (selectedFeatureId) => set({ selectedFeatureId }),
	selectFace: (selectedFaceIndex) => set({ selectedFaceIndex }),

	// UI actions
	setViewportSettings: (settings) =>
		set((state) => ({
			viewportSettings: { ...state.viewportSettings, ...settings },
		})),
	setLeftPanelWidth: (leftPanelWidth) => set({ leftPanelWidth }),
	setRightPanelWidth: (rightPanelWidth) => set({ rightPanelWidth }),
	setBottomPanelHeight: (bottomPanelHeight) => set({ bottomPanelHeight }),
	setActiveBottomTab: (activeBottomTab) => set({ activeBottomTab }),
	setActiveLeftTab: (activeLeftTab) => set({ activeLeftTab }),
	setActiveRightTab: (activeRightTab) => set({ activeRightTab }),
	toggleRightPanel: () =>
		set((state) => ({ rightPanelOpen: !state.rightPanelOpen })),
	setRightPanelOpen: (rightPanelOpen) => set({ rightPanelOpen }),
	setViewMode: (viewMode) => set({ viewMode }),

	// ─── PropertyManager ──────────────────────────────────────────
	openPropertyManager: (featureId, isNew) => {
		const state = get();
		const feature = state.model.features.find((f) => f.id === featureId);
		if (!feature) return;
		set({
			propertyManager: {
				featureId,
				isNew,
				originalParams: { ...feature.params },
			},
			activeRightTab: "properties",
			rightPanelOpen: true,
			selectedFeatureId: featureId,
		});
	},

	closePropertyManager: (commit) => {
		const state = get();
		const pm = state.propertyManager;
		if (!pm) return;

		if (!commit) {
			// Cancel: if it was a newly-inserted feature, remove it; otherwise revert params
			if (pm.isNew) {
				set({
					model: {
						...state.model,
						features: state.model.features.filter((f) => f.id !== pm.featureId),
					},
					propertyManager: null,
					selectedFeatureId: null,
				});
				return;
			}
			const originalParams = pm.originalParams;
			if (originalParams) {
				set({
					model: {
						...state.model,
						features: state.model.features.map((f) =>
							f.id === pm.featureId ? { ...f, params: originalParams } : f,
						),
					},
					propertyManager: null,
				});
				return;
			}
		}
		set({ propertyManager: null });
	},

	updateEditingFeatureParams: (updates) => {
		const state = get();
		const pm = state.propertyManager;
		if (!pm) return;
		set({
			model: {
				...state.model,
				features: state.model.features.map((f) =>
					f.id === pm.featureId
						? { ...f, params: { ...f.params, ...updates } }
						: f,
				),
			},
		});
	},

	// ─── Sketch workflow ──────────────────────────────────────────
	beginSketchWorkflow: () => {
		set({
			sketchWorkflow: { stage: "picking-plane" },
			activeLeftTab: "features",
		});
	},

	pickSketchPlane: (plane, planeFeatureId) => {
		// Create a new Sketch feature and enter sketch-editing mode
		const sketchFeature: Feature = {
			id: crypto.randomUUID(),
			name: `Sketch${get().model.features.filter((f) => f.type === "sketch").length + 1}`,
			type: "sketch",
			visible: true,
			suppressed: false,
			params: { plane, parentPlaneId: planeFeatureId },
			sketchData: {
				plane,
				entities: [],
				constraints: [],
			},
		};
		set((state) => ({
			model: {
				...state.model,
				features: [...state.model.features, sketchFeature],
				activeFeatureIndex: state.model.features.length,
			},
			sketchWorkflow: {
				stage: "editing",
				plane,
				featureId: sketchFeature.id,
			},
			viewMode: "sketch",
			selectedFeatureId: sketchFeature.id,
		}));
	},

	finishSketch: (sketchData) => {
		const state = get();
		const sw = state.sketchWorkflow;
		if (sw.stage !== "editing" || !sw.featureId) return null;

		const entityCount = sketchData?.entities.length ?? 0;

		// If no entities were drawn, delete the sketch feature
		if (entityCount === 0) {
			set({
				model: {
					...state.model,
					features: state.model.features.filter((f) => f.id !== sw.featureId),
				},
				sketchWorkflow: { stage: "idle" },
				viewMode: "3d",
			});
			return null;
		}

		set({
			model: {
				...state.model,
				features: state.model.features.map((f) =>
					f.id === sw.featureId ? { ...f, sketchData } : f,
				),
			},
			sketchWorkflow: { stage: "idle" },
			viewMode: "3d",
		});
		return sw.featureId;
	},

	cancelSketchWorkflow: () => {
		const state = get();
		const sw = state.sketchWorkflow;
		// If we were editing an empty-new sketch, remove it
		if (sw.stage === "editing" && sw.featureId) {
			const feature = state.model.features.find((f) => f.id === sw.featureId);
			const hasEntities = (feature?.sketchData?.entities.length ?? 0) > 0;
			if (!hasEntities) {
				set({
					model: {
						...state.model,
						features: state.model.features.filter((f) => f.id !== sw.featureId),
					},
				});
			}
		}
		set({
			sketchWorkflow: { stage: "idle" },
			viewMode: "3d",
		});
	},

	newModel: (name) => {
		set({
			model: createEmptyModel(name),
			meshData: null,
			selectedFeatureId: null,
			selectedFaceIndex: null,
			propertyManager: null,
			sketchWorkflow: { stage: "idle" },
			viewMode: "3d",
		});
	},

	insertFeature: (type, openPropertyManager = true) => {
		const feature: Feature = createDefaultFeature(type);
		set((state) => {
			// Find the most recent sketch feature to auto-link extrude/revolve
			const lastSketch = [...state.model.features]
				.reverse()
				.find((f) => f.type === "sketch");
			if (
				lastSketch &&
				(type === "extrude" ||
					type === "extrude-cut" ||
					type === "revolve" ||
					type === "revolve-cut")
			) {
				feature.sketchId = lastSketch.id;
			}
			return {
				model: {
					...state.model,
					features: [...state.model.features, feature],
					activeFeatureIndex: state.model.features.length,
				},
				selectedFeatureId: feature.id,
				...(openPropertyManager
					? {
							propertyManager: {
								featureId: feature.id,
								isNew: true,
								originalParams: { ...feature.params },
							},
							activeRightTab: "properties" as const,
							rightPanelOpen: true,
						}
					: {}),
			};
		});
		return feature.id;
	},

	// Chat actions
	addChatMessage: (message) =>
		set((state) => ({
			chatMessages: [
				...state.chatMessages,
				{
					...message,
					id: crypto.randomUUID(),
					timestamp: Date.now(),
				},
			],
		})),
	setChatLoading: (isChatLoading) => set({ isChatLoading }),
	clearChat: () =>
		set({
			chatMessages: [
				{
					id: "welcome",
					role: "system",
					content:
						"Welcome to AI-CAD. Describe what you want to build, or use the sketch tools to get started.",
					timestamp: Date.now(),
				},
			],
		}),

	// Editor actions
	setEditorCode: (editorCode) => set({ editorCode }),

	// History actions
	pushHistory: (label) => {
		const state = get();
		history.push({
			editorCode: state.editorCode,
			timestamp: Date.now(),
			label,
		});
		set({ canUndo: history.canUndo, canRedo: history.canRedo });
	},

	undo: () => {
		const entry = history.undo();
		if (entry) {
			set({
				editorCode: entry.editorCode,
				canUndo: history.canUndo,
				canRedo: history.canRedo,
			});
		}
	},

	redo: () => {
		const entry = history.redo();
		if (entry) {
			set({
				editorCode: entry.editorCode,
				canUndo: history.canUndo,
				canRedo: history.canRedo,
			});
		}
	},

	// Assembly actions
	addAssemblyPart: (part) =>
		set((state) => ({
			assembly: {
				...state.assembly,
				parts: [...state.assembly.parts, part],
			},
		})),

	removeAssemblyPart: (id) =>
		set((state) => ({
			assembly: {
				...state.assembly,
				parts: state.assembly.parts.filter((p) => p.id !== id),
				mates: state.assembly.mates.filter(
					(m) => m.partA !== id && m.partB !== id,
				),
			},
		})),

	addMate: (mate) =>
		set((state) => ({
			assembly: {
				...state.assembly,
				mates: [...state.assembly.mates, mate],
			},
		})),

	removeMate: (id) =>
		set((state) => ({
			assembly: {
				...state.assembly,
				mates: state.assembly.mates.filter((m) => m.id !== id),
			},
		})),
}));
