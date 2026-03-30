/**
 * Splicer & Macro MCP Browser Executor
 *
 * Bridges splicer/macro/batch MCP tool calls to the live stores,
 * database, and CAD engine. Extends the existing BROWSER_TOOL_REGISTRY.
 */

import * as db from "@/lib/database/indexed-db";
import {
	BUILTIN_MACROS,
	compileMacro,
	createBatchJob,
	executeBatchRow,
	executeMacro,
} from "@/lib/macro/macro-engine";
import {
	autoDetectConnections,
	createConnectionPoint,
	findCompatibleConnections,
	generateAssemblyCode,
	generateExtrusionWithConnections,
} from "@/lib/splicer/splicer-engine";
import { useConsoleStore } from "@/lib/store/console-store";
import { useSplicerMacroStore } from "@/lib/store/splicer-store";
import type { PartLibraryItem } from "@/types/cad";
import type { BatchJob, MacroDefinition } from "@/types/macro";
import type {
	ConnectionPoint,
	ExtrusionProfile,
	SpliceJoint,
	SplicerDefinition,
} from "@/types/splicer";
import { executeCode } from "./browser-executor";
import type { ExecutorResult } from "./browser-executor";

function log(message: string) {
	useConsoleStore.getState().log(message, "info", "mcp");
}

function logError(message: string) {
	useConsoleStore.getState().log(message, "error", "mcp");
}

// ─── Splicer Executors ─────────────────────────────────────────

async function handleCreateSplicer(
	args: Record<string, unknown>,
): Promise<ExecutorResult> {
	const partName = args.partName as string;
	const code = args.code as string;
	const connections = (
		args.connections as Array<{
			name: string;
			position: { x: number; y: number; z: number };
			normal: { x: number; y: number; z: number };
			gender?: string;
			diameter?: number;
			compatTags?: string[];
		}>
	).map((c) =>
		createConnectionPoint(c.name, c.position, c.normal, {
			gender: (c.gender as ConnectionPoint["gender"]) || "neutral",
			diameter: c.diameter || 10,
			compatTags: c.compatTags || [],
		}),
	);

	const splicer: SplicerDefinition = {
		id: crypto.randomUUID(),
		partId: crypto.randomUUID(),
		partName,
		connections,
		code,
		parameters: args.parameters as Record<string, number> | undefined,
		createdAt: Date.now(),
		updatedAt: Date.now(),
	};

	// Save to store and DB
	useSplicerMacroStore.getState().addSplicer(splicer);
	await db.put("splicers", splicer);

	log(
		`Created splicer "${partName}" with ${connections.length} connection points`,
	);
	return {
		success: true,
		message: `Splicer "${partName}" created with ${connections.length} connections`,
		data: {
			splicerId: splicer.id,
			connectionIds: connections.map((c) => c.id),
		},
	};
}

async function handleSpliceParts(
	args: Record<string, unknown>,
): Promise<ExecutorResult> {
	const store = useSplicerMacroStore.getState();
	const sourceSplicerId = args.sourceSplicerId as string;
	const targetSplicerId = args.targetSplicerId as string;

	const source = store.splicers.find((s) => s.id === sourceSplicerId);
	const target = store.splicers.find((s) => s.id === targetSplicerId);

	if (!source || !target) {
		return { success: false, message: "Splicer definition not found" };
	}

	// Create or get assembly
	let assembly = store.activeAssembly;
	if (!assembly) {
		assembly = store.createAssembly(`${source.partName} + ${target.partName}`);
	}

	// Add splicers to assembly if not already there
	if (!assembly.splicers.find((s) => s.id === source.id)) {
		store.addSplicerToAssembly(source);
	}
	if (!assembly.splicers.find((s) => s.id === target.id)) {
		store.addSplicerToAssembly(target);
	}

	// Create joint
	const joint: SpliceJoint = {
		id: crypto.randomUUID(),
		sourceSplicerId,
		sourceConnectionId: args.sourceConnectionId as string,
		targetSplicerId,
		targetConnectionId: args.targetConnectionId as string,
		jointType: (args.jointType as SpliceJoint["jointType"]) || "butt",
		fuseGeometry: (args.fuse as boolean) ?? true,
		offset: (args.offset as number) || 0,
		locked: false,
	};

	store.addJoint(joint);

	// Generate and execute assembly code
	const updatedAssembly = useSplicerMacroStore.getState().activeAssembly;
	if (updatedAssembly) {
		const code = generateAssemblyCode(updatedAssembly);
		updatedAssembly.combinedCode = code;

		log(`Spliced ${source.partName} ↔ ${target.partName}`);
		return executeCode(code);
	}

	return { success: true, message: "Joint created" };
}

async function handleFindCompatibleConnections(
	args: Record<string, unknown>,
): Promise<ExecutorResult> {
	const store = useSplicerMacroStore.getState();
	const source = store.splicers.find((s) => s.id === args.sourceSplicerId);
	const target = store.splicers.find((s) => s.id === args.targetSplicerId);

	if (!source || !target) {
		return { success: false, message: "Splicer definition not found" };
	}

	const matches = findCompatibleConnections(source, target);

	return {
		success: true,
		message: `Found ${matches.length} compatible connection pair(s)`,
		data: {
			matches: matches.map((m) => ({
				sourceConnection: m.source.name,
				sourceConnectionId: m.source.id,
				targetConnection: m.target.name,
				targetConnectionId: m.target.id,
				score: m.score,
			})),
		},
	};
}

async function handleAutoDetectConnections(
	args: Record<string, unknown>,
): Promise<ExecutorResult> {
	const partName = args.partName as string;
	const bbox = args.boundingBox as {
		min: { x: number; y: number; z: number };
		max: { x: number; y: number; z: number };
	};
	const compatTags = (args.compatTags as string[]) || [];

	const connections = autoDetectConnections(partName, bbox, compatTags);

	// Create splicer definition with auto-detected connections
	const splicer: SplicerDefinition = {
		id: crypto.randomUUID(),
		partId: crypto.randomUUID(),
		partName,
		connections,
		code: args.code as string,
		createdAt: Date.now(),
		updatedAt: Date.now(),
	};

	useSplicerMacroStore.getState().addSplicer(splicer);
	await db.put("splicers", splicer);

	log(`Auto-detected ${connections.length} connections for "${partName}"`);
	return {
		success: true,
		message: `Created splicer with ${connections.length} auto-detected connections`,
		data: {
			splicerId: splicer.id,
			connections: connections.map((c) => ({ name: c.name, id: c.id })),
		},
	};
}

async function handleGenerateAssemblyCode(
	args: Record<string, unknown>,
): Promise<ExecutorResult> {
	const assemblyId = args.assemblyId as string;

	// Try store first, then DB
	let assembly = useSplicerMacroStore.getState().activeAssembly;
	if (!assembly || assembly.id !== assemblyId) {
		assembly =
			(await db.get<import("@/types/splicer").SpliceAssembly>(
				"spliceAssemblies",
				assemblyId,
			)) || null;
	}

	if (!assembly) {
		return { success: false, message: "Assembly not found" };
	}

	const code = generateAssemblyCode(assembly);
	log(`Generated assembly code for "${assembly.name}"`);

	return executeCode(code);
}

async function handleExtrudeWithConnections(
	args: Record<string, unknown>,
): Promise<ExecutorResult> {
	const profile: ExtrusionProfile = {
		id: crypto.randomUUID(),
		name: args.name as string,
		sketchCode: args.sketchCode as string,
		extrusionType:
			(args.extrusionType as ExtrusionProfile["extrusionType"]) || "linear",
		params: {
			height: (args.height as number) || 20,
			taperAngle: args.taperAngle as number | undefined,
			twistAngle: args.twistAngle as number | undefined,
			pathCode: args.pathCode as string | undefined,
		},
		endConnections: {
			start: {
				name: `${args.name}-start`,
				position: { x: 0, y: 0, z: 0 },
				normal: { x: 0, y: 0, z: -1 },
				up: { x: 0, y: 1, z: 0 },
				gender: "neutral",
				diameter: (args.connectionDiameter as number) || 10,
				compatTags: (args.compatTags as string[]) || [],
			},
			end: {
				name: `${args.name}-end`,
				position: { x: 0, y: 0, z: (args.height as number) || 20 },
				normal: { x: 0, y: 0, z: 1 },
				up: { x: 0, y: 1, z: 0 },
				gender: "neutral",
				diameter: (args.connectionDiameter as number) || 10,
				compatTags: (args.compatTags as string[]) || [],
			},
		},
	};

	const result = generateExtrusionWithConnections(profile);

	// Create splicer with the generated connections
	const splicer: SplicerDefinition = {
		id: crypto.randomUUID(),
		partId: crypto.randomUUID(),
		partName: args.name as string,
		connections: result.connections,
		code: result.code,
		createdAt: Date.now(),
		updatedAt: Date.now(),
	};

	useSplicerMacroStore.getState().addSplicer(splicer);
	await db.put("splicers", splicer);

	log(
		`Extruded "${args.name}" with ${result.connections.length} end connections`,
	);
	return executeCode(result.code);
}

// ─── Macro Executors ───────────────────────────────────────────

async function handleRunMacro(
	args: Record<string, unknown>,
): Promise<ExecutorResult> {
	const macroId = args.macroId as string;
	const paramOverrides = (args.parameters as Record<string, unknown>) || {};

	// Find macro (store → DB → built-in)
	let macro = useSplicerMacroStore
		.getState()
		.macros.find((m) => m.id === macroId);
	if (!macro) {
		macro = (await db.get<MacroDefinition>("macros", macroId)) || undefined;
	}
	if (!macro) {
		macro = BUILTIN_MACROS.find((m) => m.id === macroId);
	}
	if (!macro) {
		return { success: false, message: `Macro not found: ${macroId}` };
	}

	const execution = executeMacro(macro, paramOverrides);
	useSplicerMacroStore.getState().addExecution(execution);
	await db.put("executions", execution);

	if (execution.status === "failed") {
		logError(`Macro "${macro.name}" failed: ${execution.error}`);
		return {
			success: false,
			message: execution.error || "Macro execution failed",
		};
	}

	log(
		`Macro "${macro.name}" generated ${execution.generatedCode.length} chars of code`,
	);

	if ((args.autoRun as boolean) !== false) {
		return executeCode(execution.generatedCode);
	}

	return {
		success: true,
		message: `Macro "${macro.name}" executed — code generated`,
		data: {
			executionId: execution.id,
			codeLength: execution.generatedCode.length,
		},
	};
}

async function handleCreateMacro(
	args: Record<string, unknown>,
): Promise<ExecutorResult> {
	const params = (args.parameters as Array<Record<string, unknown>>) || [];

	const macro: MacroDefinition = {
		id: crypto.randomUUID(),
		name: args.name as string,
		description: args.description as string,
		version: 1,
		parameters: params.map((p) => ({
			id: crypto.randomUUID(),
			name: p.name as string,
			label: p.label as string,
			type:
				(p.type as MacroDefinition["parameters"][number]["type"]) || "number",
			defaultValue: p.defaultValue,
			min: p.min as number | undefined,
			max: p.max as number | undefined,
			step: p.step as number | undefined,
			unit: p.unit as string | undefined,
		})),
		steps: [
			{
				id: crypto.randomUUID(),
				type: "execute_code",
				label: "Main code",
				params: {},
				code: args.code as string,
				enabled: true,
			},
		],
		category: (args.category as string) || "Custom",
		tags: (args.tags as string[]) || [],
		generatesSplicerPoints: false,
		createdAt: Date.now(),
		updatedAt: Date.now(),
	};

	// Compile to validate
	macro.compiledCode = compileMacro(macro);

	useSplicerMacroStore.getState().addMacro(macro);
	await db.put("macros", macro);

	log(
		`Created macro "${macro.name}" with ${macro.parameters.length} parameters`,
	);
	return {
		success: true,
		message: `Macro "${macro.name}" created`,
		data: { macroId: macro.id },
	};
}

async function handleListMacros(
	args: Record<string, unknown>,
): Promise<ExecutorResult> {
	const category = args.category as string | undefined;
	const searchQuery = args.search as string | undefined;

	// Combine store + DB + built-in
	const storeMacros = useSplicerMacroStore.getState().macros;
	const dbMacros = await db.getAll<MacroDefinition>("macros");
	const allIds = new Set<string>();
	const all: MacroDefinition[] = [];

	for (const m of [...BUILTIN_MACROS, ...storeMacros, ...dbMacros]) {
		if (!allIds.has(m.id)) {
			allIds.add(m.id);
			all.push(m);
		}
	}

	let filtered = all;
	if (category) {
		filtered = filtered.filter((m) => m.category === category);
	}
	if (searchQuery) {
		const q = searchQuery.toLowerCase();
		filtered = filtered.filter(
			(m) =>
				m.name.toLowerCase().includes(q) ||
				m.description.toLowerCase().includes(q) ||
				m.tags.some((t) => t.toLowerCase().includes(q)),
		);
	}

	return {
		success: true,
		message: `Found ${filtered.length} macro(s)`,
		data: {
			macros: filtered.map((m) => ({
				id: m.id,
				name: m.name,
				description: m.description,
				category: m.category,
				parameterCount: m.parameters.length,
				tags: m.tags,
			})),
		},
	};
}

async function handleRecordMacro(
	args: Record<string, unknown>,
): Promise<ExecutorResult> {
	const action = args.action as "start" | "stop" | "cancel";
	const store = useSplicerMacroStore.getState();

	switch (action) {
		case "start":
			store.startRecording();
			log("Macro recording started");
			return {
				success: true,
				message: "Recording started — all CAD operations will be captured",
			};

		case "stop": {
			const steps = store.stopRecording();
			if (steps.length === 0) {
				return { success: false, message: "No steps recorded" };
			}

			const name =
				(args.name as string) || `Recording ${new Date().toLocaleTimeString()}`;
			const macro: MacroDefinition = {
				id: crypto.randomUUID(),
				name,
				description: `Recorded macro with ${steps.length} steps`,
				version: 1,
				parameters: [],
				steps,
				category: "Recorded",
				tags: ["recorded"],
				generatesSplicerPoints: false,
				createdAt: Date.now(),
				updatedAt: Date.now(),
			};

			macro.compiledCode = compileMacro(macro);
			store.addMacro(macro);
			await db.put("macros", macro);

			log(`Macro "${name}" saved with ${steps.length} steps`);
			return {
				success: true,
				message: `Recorded macro "${name}" with ${steps.length} steps`,
				data: { macroId: macro.id, stepCount: steps.length },
			};
		}

		case "cancel":
			store.cancelRecording();
			log("Macro recording cancelled");
			return { success: true, message: "Recording cancelled" };

		default:
			return { success: false, message: `Unknown action: ${action}` };
	}
}

// ─── Batch Executors ───────────────────────────────────────────

async function handleCreateBatchJob(
	args: Record<string, unknown>,
): Promise<ExecutorResult> {
	const macroId = args.macroId as string;

	// Find macro
	let macro = useSplicerMacroStore
		.getState()
		.macros.find((m) => m.id === macroId);
	if (!macro)
		macro = (await db.get<MacroDefinition>("macros", macroId)) || undefined;
	if (!macro) macro = BUILTIN_MACROS.find((m) => m.id === macroId);
	if (!macro) return { success: false, message: `Macro not found: ${macroId}` };

	const sweeps = (args.sweeps as Array<Record<string, unknown>>).map((s) => ({
		paramId: "",
		paramName: s.paramName as string,
		sweepType:
			(s.sweepType as "linear" | "logarithmic" | "list" | "random") || "linear",
		start: s.start as number | undefined,
		end: s.end as number | undefined,
		count: s.count as number | undefined,
		values: s.values as unknown[] | undefined,
		min: s.min as number | undefined,
		max: s.max as number | undefined,
	}));

	const job = createBatchJob(
		{
			macroId,
			sweeps,
			namingTemplate: (args.namingTemplate as string) || "Part-${index}",
			concurrency: (args.concurrency as number) || 1,
		},
		macro,
	);

	job.autoExport = (args.autoExport as boolean) || false;
	job.exportFormat = args.exportFormat as "step" | "stl" | undefined;
	job.storeParts = (args.storeParts as boolean) ?? true;
	job.storeCategory = args.storeCategory as string | undefined;

	useSplicerMacroStore.getState().addBatchJob(job);
	await db.put("batchJobs", job);

	log(`Batch job created: ${job.rows.length} parts from "${macro.name}"`);
	return {
		success: true,
		message: `Batch job created with ${job.rows.length} parts`,
		data: { batchId: job.id, rowCount: job.rows.length },
	};
}

async function handleRunBatchJob(
	args: Record<string, unknown>,
): Promise<ExecutorResult> {
	const batchId = args.batchId as string;
	const store = useSplicerMacroStore.getState();

	let job = store.batchJobs.find((j) => j.id === batchId);
	if (!job) job = (await db.get<BatchJob>("batchJobs", batchId)) || undefined;
	if (!job)
		return { success: false, message: `Batch job not found: ${batchId}` };

	// Find macro
	let macro = store.macros.find((m) => m.id === job.macroId);
	if (!macro)
		macro = (await db.get<MacroDefinition>("macros", job.macroId)) || undefined;
	if (!macro) macro = BUILTIN_MACROS.find((m) => m.id === job.macroId);
	if (!macro)
		return { success: false, message: `Macro not found: ${job.macroId}` };

	// Update status
	store.updateBatchJob(batchId, { status: "running", progress: 0 });
	store.setActiveBatch(batchId);

	log(`Running batch "${job.name}" — ${job.rows.length} parts`);

	let completed = 0;
	let failed = 0;

	for (let i = 0; i < job.rows.length; i++) {
		const row = job.rows[i];
		row.status = "running";

		const result = executeBatchRow(macro, row);

		if (result.error) {
			row.status = "failed";
			row.error = result.error;
			failed++;
		} else {
			row.status = "completed";
			row.generatedCode = result.code;
			completed++;

			// Store generated part in DB if requested
			if (job.storeParts) {
				const part: PartLibraryItem = {
					id: crypto.randomUUID(),
					name: row.partName || `${job.macroName}-${i}`,
					category: job.storeCategory || macro.category,
					description: `Batch-generated from "${job.macroName}" — row ${i}`,
					code: result.code,
					tags: [...(job.storeTags || []), "batch-generated", job.id],
					parameters: {},
				};
				await db.put("parts", part);
			}
		}

		const progress = Math.round(((i + 1) / job.rows.length) * 100);
		store.updateBatchJob(batchId, { rows: [...job.rows], progress });
	}

	const finalStatus = failed === job.rows.length ? "failed" : "completed";
	store.updateBatchJob(batchId, {
		status: finalStatus,
		progress: 100,
		completedAt: Date.now(),
	});

	// Persist to DB
	const updatedJob = store.batchJobs.find((j) => j.id === batchId);
	if (updatedJob) await db.put("batchJobs", updatedJob);

	log(`Batch completed: ${completed} succeeded, ${failed} failed`);
	return {
		success: true,
		message: `Batch completed: ${completed}/${job.rows.length} parts generated (${failed} failed)`,
		data: { completed, failed, total: job.rows.length },
	};
}

async function handleGetBatchStatus(
	args: Record<string, unknown>,
): Promise<ExecutorResult> {
	const batchId = args.batchId as string;
	const store = useSplicerMacroStore.getState();

	let job = store.batchJobs.find((j) => j.id === batchId);
	if (!job) job = (await db.get<BatchJob>("batchJobs", batchId)) || undefined;
	if (!job)
		return { success: false, message: `Batch job not found: ${batchId}` };

	const completed = job.rows.filter((r) => r.status === "completed").length;
	const failed = job.rows.filter((r) => r.status === "failed").length;
	const pending = job.rows.filter((r) => r.status === "pending").length;

	return {
		success: true,
		message: `Batch "${job.name}": ${job.status} (${job.progress}%)`,
		data: {
			status: job.status,
			progress: job.progress,
			total: job.rows.length,
			completed,
			failed,
			pending,
		},
	};
}

async function handleListParts(
	args: Record<string, unknown>,
): Promise<ExecutorResult> {
	const category = args.category as string | undefined;
	const searchQuery = args.search as string | undefined;
	const limit = (args.limit as number) || 50;

	let parts: PartLibraryItem[];

	if (searchQuery) {
		parts = await db.search<PartLibraryItem>("parts", searchQuery);
	} else if (category) {
		parts = await db.getByIndex<PartLibraryItem>("parts", "category", category);
	} else {
		parts = await db.getAll<PartLibraryItem>("parts");
	}

	parts = parts.slice(0, limit);

	return {
		success: true,
		message: `Found ${parts.length} part(s) in database`,
		data: {
			parts: parts.map((p) => ({
				id: p.id,
				name: p.name,
				category: p.category,
				description: p.description,
				tags: p.tags,
			})),
		},
	};
}

async function handleGetDbStats(): Promise<ExecutorResult> {
	const stats = await db.getStats();
	return {
		success: true,
		message: "Database statistics",
		data: stats as unknown as Record<string, unknown>,
	};
}

// ─── Tool Registry ─────────────────────────────────────────────

export const SPLICER_MACRO_TOOL_REGISTRY: Record<
	string,
	(args: Record<string, unknown>) => Promise<ExecutorResult>
> = {
	create_splicer: handleCreateSplicer,
	splice_parts: handleSpliceParts,
	find_compatible_connections: handleFindCompatibleConnections,
	auto_detect_connections: handleAutoDetectConnections,
	generate_assembly_code: handleGenerateAssemblyCode,
	extrude_with_connections: handleExtrudeWithConnections,
	run_macro: handleRunMacro,
	create_macro: handleCreateMacro,
	list_macros: handleListMacros,
	record_macro: handleRecordMacro,
	create_batch_job: handleCreateBatchJob,
	run_batch_job: handleRunBatchJob,
	get_batch_status: handleGetBatchStatus,
	list_parts: handleListParts,
	get_db_stats: handleGetDbStats,
};
