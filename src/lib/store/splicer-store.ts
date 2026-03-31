/**
 * Splicer & Macro Zustand Store
 *
 * Manages runtime state for splicer definitions, splice assemblies,
 * macros, macro recording, and batch jobs.
 */

import type {
	BatchJob,
	MacroDefinition,
	MacroExecution,
	MacroRecordingState,
	MacroStep,
} from "@/types/macro";
import type {
	SpliceAssembly,
	SpliceJoint,
	SplicerDefinition,
} from "@/types/splicer";
import { create } from "zustand";

interface SplicerMacroState {
	// ─── Splicer State ──────────────────────────────────────────
	splicers: SplicerDefinition[];
	activeAssembly: SpliceAssembly | null;
	selectedSplicerId: string | null;
	selectedConnectionId: string | null;

	// Splicer actions
	addSplicer: (splicer: SplicerDefinition) => void;
	removeSplicer: (id: string) => void;
	updateSplicer: (id: string, updates: Partial<SplicerDefinition>) => void;
	selectSplicer: (id: string | null) => void;
	selectConnection: (id: string | null) => void;

	// Assembly actions
	setActiveAssembly: (assembly: SpliceAssembly | null) => void;
	createAssembly: (name: string) => SpliceAssembly;
	addJoint: (joint: SpliceJoint) => void;
	removeJoint: (id: string) => void;
	addSplicerToAssembly: (splicer: SplicerDefinition) => void;

	// ─── Macro State ────────────────────────────────────────────
	macros: MacroDefinition[];
	selectedMacroId: string | null;
	recording: MacroRecordingState;
	recentExecutions: MacroExecution[];

	// Macro actions
	addMacro: (macro: MacroDefinition) => void;
	removeMacro: (id: string) => void;
	updateMacro: (id: string, updates: Partial<MacroDefinition>) => void;
	selectMacro: (id: string | null) => void;

	// Recording actions
	startRecording: () => void;
	stopRecording: () => MacroStep[];
	cancelRecording: () => void;
	addRecordedStep: (step: MacroStep) => void;

	// Execution tracking
	addExecution: (execution: MacroExecution) => void;
	clearExecutions: () => void;

	// ─── Batch State ────────────────────────────────────────────
	batchJobs: BatchJob[];
	activeBatchId: string | null;

	// Batch actions
	addBatchJob: (job: BatchJob) => void;
	updateBatchJob: (id: string, updates: Partial<BatchJob>) => void;
	removeBatchJob: (id: string) => void;
	setActiveBatch: (id: string | null) => void;
}

export const useSplicerMacroStore = create<SplicerMacroState>((set, get) => ({
	// ─── Splicer Initial State ──────────────────────────────────
	splicers: [],
	activeAssembly: null,
	selectedSplicerId: null,
	selectedConnectionId: null,

	addSplicer: (splicer) =>
		set((state) => ({ splicers: [...state.splicers, splicer] })),

	removeSplicer: (id) =>
		set((state) => ({
			splicers: state.splicers.filter((s) => s.id !== id),
			selectedSplicerId:
				state.selectedSplicerId === id ? null : state.selectedSplicerId,
		})),

	updateSplicer: (id, updates) =>
		set((state) => ({
			splicers: state.splicers.map((s) =>
				s.id === id ? { ...s, ...updates, updatedAt: Date.now() } : s,
			),
		})),

	selectSplicer: (id) => set({ selectedSplicerId: id }),
	selectConnection: (id) => set({ selectedConnectionId: id }),

	setActiveAssembly: (assembly) => set({ activeAssembly: assembly }),

	createAssembly: (name) => {
		const assembly: SpliceAssembly = {
			id: crypto.randomUUID(),
			name,
			description: "",
			splicers: [],
			joints: [],
			tags: [],
			createdAt: Date.now(),
			updatedAt: Date.now(),
		};
		set({ activeAssembly: assembly });
		return assembly;
	},

	addJoint: (joint) =>
		set((state) => {
			if (!state.activeAssembly) return state;
			return {
				activeAssembly: {
					...state.activeAssembly,
					joints: [...state.activeAssembly.joints, joint],
					updatedAt: Date.now(),
				},
			};
		}),

	removeJoint: (id) =>
		set((state) => {
			if (!state.activeAssembly) return state;
			return {
				activeAssembly: {
					...state.activeAssembly,
					joints: state.activeAssembly.joints.filter((j) => j.id !== id),
					updatedAt: Date.now(),
				},
			};
		}),

	addSplicerToAssembly: (splicer) =>
		set((state) => {
			if (!state.activeAssembly) return state;
			return {
				activeAssembly: {
					...state.activeAssembly,
					splicers: [...state.activeAssembly.splicers, splicer],
					updatedAt: Date.now(),
				},
			};
		}),

	// ─── Macro Initial State ────────────────────────────────────
	macros: [],
	selectedMacroId: null,
	recording: { isRecording: false, recordedSteps: [] },
	recentExecutions: [],

	addMacro: (macro) => set((state) => ({ macros: [...state.macros, macro] })),

	removeMacro: (id) =>
		set((state) => ({
			macros: state.macros.filter((m) => m.id !== id),
			selectedMacroId:
				state.selectedMacroId === id ? null : state.selectedMacroId,
		})),

	updateMacro: (id, updates) =>
		set((state) => ({
			macros: state.macros.map((m) =>
				m.id === id ? { ...m, ...updates, updatedAt: Date.now() } : m,
			),
		})),

	selectMacro: (id) => set({ selectedMacroId: id }),

	startRecording: () =>
		set({
			recording: {
				isRecording: true,
				recordedSteps: [],
				startedAt: Date.now(),
			},
		}),

	stopRecording: () => {
		const steps = get().recording.recordedSteps;
		set({
			recording: { isRecording: false, recordedSteps: [] },
		});
		return steps;
	},

	cancelRecording: () =>
		set({
			recording: { isRecording: false, recordedSteps: [] },
		}),

	addRecordedStep: (step) =>
		set((state) => ({
			recording: {
				...state.recording,
				recordedSteps: [...state.recording.recordedSteps, step],
			},
		})),

	addExecution: (execution) =>
		set((state) => ({
			recentExecutions: [execution, ...state.recentExecutions].slice(0, 50),
		})),

	clearExecutions: () => set({ recentExecutions: [] }),

	// ─── Batch Initial State ────────────────────────────────────
	batchJobs: [],
	activeBatchId: null,

	addBatchJob: (job) =>
		set((state) => ({ batchJobs: [...state.batchJobs, job] })),

	updateBatchJob: (id, updates) =>
		set((state) => ({
			batchJobs: state.batchJobs.map((j) =>
				j.id === id ? { ...j, ...updates, updatedAt: Date.now() } : j,
			),
		})),

	removeBatchJob: (id) =>
		set((state) => ({
			batchJobs: state.batchJobs.filter((j) => j.id !== id),
			activeBatchId: state.activeBatchId === id ? null : state.activeBatchId,
		})),

	setActiveBatch: (id) => set({ activeBatchId: id }),
}));
