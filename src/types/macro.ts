/**
 * Macro Types
 *
 * Macros record sequences of CAD operations that can be parameterized,
 * saved, and replayed. They're the foundation for mass part creation.
 */

// ─── Macro Parameter ───────────────────────────────────────────

export type MacroParamType =
	| "number"
	| "string"
	| "boolean"
	| "select"
	| "point3d";

export interface MacroParam {
	id: string;
	name: string;
	label: string;
	type: MacroParamType;
	defaultValue: unknown;
	/** For number params: min/max/step */
	min?: number;
	max?: number;
	step?: number;
	/** Unit label (e.g. "mm", "deg") */
	unit?: string;
	/** For select params: allowed options */
	options?: { label: string; value: unknown }[];
	/** Description shown in UI */
	description?: string;
}

// ─── Macro Step ────────────────────────────────────────────────

export type MacroStepType =
	| "create_primitive"
	| "extrude"
	| "revolve"
	| "sweep"
	| "loft"
	| "fillet"
	| "chamfer"
	| "boolean_fuse"
	| "boolean_cut"
	| "boolean_common"
	| "shell"
	| "mirror"
	| "pattern"
	| "transform"
	| "execute_code"
	| "splice"
	| "add_connection_point";

export interface MacroStep {
	id: string;
	/** Operation type */
	type: MacroStepType;
	/** Human-readable label */
	label: string;
	/** Parameters for this step — values can reference macro params via "${paramName}" */
	params: Record<string, unknown>;
	/** Raw Replicad code (for execute_code steps). Can contain ${paramName} interpolations */
	code?: string;
	/** Whether this step is enabled */
	enabled: boolean;
	/** Optional condition expression: step runs only if this evaluates truthy */
	condition?: string;
}

// ─── Macro Definition ──────────────────────────────────────────

export interface MacroDefinition {
	id: string;
	name: string;
	description: string;
	/** Version for tracking changes */
	version: number;
	/** Exposed parameters that users can customize */
	parameters: MacroParam[];
	/** Ordered list of operations */
	steps: MacroStep[];
	/** Category for organization */
	category: string;
	/** Tags for search */
	tags: string[];
	/** Whether this macro generates splicer connection points */
	generatesSplicerPoints: boolean;
	/** Auto-generated Replicad code template (compiled from steps) */
	compiledCode?: string;
	createdAt: number;
	updatedAt: number;
}

// ─── Macro Execution ───────────────────────────────────────────

export interface MacroExecution {
	id: string;
	macroId: string;
	macroName: string;
	/** Parameter values used for this execution */
	parameterValues: Record<string, unknown>;
	/** Final generated code */
	generatedCode: string;
	/** Execution status */
	status: "pending" | "running" | "completed" | "failed";
	/** Error message if failed */
	error?: string;
	/** Execution timestamp */
	executedAt: number;
	/** Duration in ms */
	duration?: number;
}

// ─── Macro Recording ───────────────────────────────────────────

export interface MacroRecordingState {
	isRecording: boolean;
	recordedSteps: MacroStep[];
	startedAt?: number;
}

// ─── Batch / Mass Part Creation ────────────────────────────────

export type BatchStatus =
	| "draft"
	| "queued"
	| "running"
	| "completed"
	| "failed"
	| "cancelled";

export interface BatchParameterRow {
	/** Row index */
	index: number;
	/** Parameter values for this instance */
	values: Record<string, unknown>;
	/** Custom name for the generated part (optional) */
	partName?: string;
	/** Status of this individual row */
	status: "pending" | "running" | "completed" | "failed";
	/** Error for this row if failed */
	error?: string;
	/** Generated code for this row */
	generatedCode?: string;
}

export interface BatchJob {
	id: string;
	name: string;
	description: string;
	/** Macro used for generation */
	macroId: string;
	macroName: string;
	/** Parameter rows — each row generates one part */
	rows: BatchParameterRow[];
	/** Overall status */
	status: BatchStatus;
	/** Progress (0-100) */
	progress: number;
	/** Whether to auto-export generated parts */
	autoExport: boolean;
	/** Export format if auto-exporting */
	exportFormat?: "step" | "stl";
	/** Whether to store results in the parts database */
	storeParts: boolean;
	/** Category for stored parts */
	storeCategory?: string;
	/** Tags applied to all stored parts */
	storeTags?: string[];
	createdAt: number;
	updatedAt: number;
	completedAt?: number;
}

// ─── Parameter Sweep Generators ────────────────────────────────

export type SweepType = "linear" | "logarithmic" | "list" | "random";

export interface ParameterSweep {
	paramId: string;
	paramName: string;
	sweepType: SweepType;
	/** For linear/log: start, end, count */
	start?: number;
	end?: number;
	count?: number;
	/** For list: explicit values */
	values?: unknown[];
	/** For random: min, max, count */
	min?: number;
	max?: number;
}

export interface BatchConfig {
	/** Macro to use */
	macroId: string;
	/** Parameter sweeps — cross-product generates all combinations */
	sweeps: ParameterSweep[];
	/** Naming template, e.g. "Bracket-${width}x${height}" */
	namingTemplate: string;
	/** Max concurrent executions */
	concurrency: number;
}
