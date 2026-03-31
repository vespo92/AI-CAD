import {
	type Assembly,
	type CadModel,
	type ChatMessage,
	DEFAULT_VIEWPORT_SETTINGS,
	type Feature,
	type MeshData,
	type ViewportSettings,
} from "@/types/cad";
import { create } from "zustand";
import { history } from "./history";

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
	activeRightTab: "export" | "jobs";
	rightPanelOpen: boolean;

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
	setActiveRightTab: (tab: "export" | "jobs") => void;
	toggleRightPanel: () => void;

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

const createEmptyModel = (): CadModel => ({
	id: crypto.randomUUID(),
	name: "Untitled Model",
	features: [],
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
	rightPanelWidth: 300,
	bottomPanelHeight: 280,
	activeBottomTab: "chat",
	activeLeftTab: "features",
	activeRightTab: "export",
	rightPanelOpen: false,

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
