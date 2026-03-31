/**
 * Macro Engine
 *
 * Records, compiles, and executes macros. A macro is a parameterized
 * sequence of CAD operations that can generate Replicad code.
 */

import type {
	BatchConfig,
	BatchJob,
	BatchParameterRow,
	MacroDefinition,
	MacroExecution,
	MacroParam,
	MacroStep,
	ParameterSweep,
} from "@/types/macro";

// ─── Macro Compilation ─────────────────────────────────────────

/**
 * Compile a macro definition into a code template string.
 * Parameter references like ${width} are left as-is for later substitution.
 */
export function compileMacro(macro: MacroDefinition): string {
	const lines: string[] = [];
	lines.push(`// Macro: ${macro.name} v${macro.version}`);
	lines.push(`// ${macro.description}`);
	lines.push("");

	let prevVar = "";
	let stepIdx = 0;

	for (const step of macro.steps) {
		if (!step.enabled) continue;

		// Condition check (injected as runtime if-block)
		if (step.condition) {
			lines.push(`// Conditional: ${step.condition}`);
		}

		const varName = `s${stepIdx}`;
		const code = compileStep(step, prevVar, varName);
		if (code) {
			lines.push(`// Step ${stepIdx}: ${step.label}`);
			lines.push(code);
			lines.push("");
			prevVar = varName;
			stepIdx++;
		}
	}

	if (prevVar) {
		lines.push(`return ${prevVar};`);
	}

	return lines.join("\n");
}

function compileStep(
	step: MacroStep,
	prevVar: string,
	varName: string,
): string {
	const p = step.params;

	switch (step.type) {
		case "create_primitive": {
			const ptype = p.primitiveType || "box";
			if (ptype === "box") {
				return `const ${varName} = makeBaseBox(${ref(p.width, 50)}, ${ref(p.depth, 50)}, ${ref(p.height, 20)});`;
			}
			if (ptype === "cylinder") {
				return `const ${varName} = makeCylinder(${ref(p.radius, 20)}, ${ref(p.height, 50)});`;
			}
			if (ptype === "sphere") {
				return `const ${varName} = makeSphere(${ref(p.radius, 25)});`;
			}
			return "";
		}

		case "extrude":
			if (prevVar) {
				return `const ${varName} = ${prevVar}.extrude(${ref(p.height, 20)});`;
			}
			return `const ${varName} = drawRoundedRectangle(${ref(p.width, 40)}, ${ref(p.depth, 30)}, 0).sketchOnPlane("XY").extrude(${ref(p.height, 20)});`;

		case "revolve":
			if (!prevVar) return "";
			return `const ${varName} = ${prevVar}.revolve(${ref(p.angle, 360)});`;

		case "fillet":
			if (!prevVar) return "";
			return `const ${varName} = ${prevVar}.fillet(${ref(p.radius, 2)}, (e) => e);`;

		case "chamfer":
			if (!prevVar) return "";
			return `const ${varName} = ${prevVar}.chamfer(${ref(p.distance, 1)}, (e) => e);`;

		case "boolean_fuse":
			if (!prevVar) return "";
			return `const ${varName}_tool = ${ref(p.toolCode, "makeBaseBox(10, 10, 10)")};\nconst ${varName} = ${prevVar}.fuse(${varName}_tool);`;

		case "boolean_cut":
			if (!prevVar) return "";
			return `const ${varName}_tool = ${ref(p.toolCode, "makeCylinder(5, 30)")};\nconst ${varName} = ${prevVar}.cut(${varName}_tool);`;

		case "boolean_common":
			if (!prevVar) return "";
			return `const ${varName}_tool = ${ref(p.toolCode, "makeBaseBox(20, 20, 20)")};\nconst ${varName} = ${prevVar}.common(${varName}_tool);`;

		case "shell":
			if (!prevVar) return "";
			return `const ${varName} = ${prevVar}.shell(${ref(p.thickness, 2)}, (f) => f);`;

		case "mirror":
			if (!prevVar) return "";
			return `const ${varName} = ${prevVar}.mirror("${p.plane || "XY"}");`;

		case "pattern": {
			if (!prevVar) return "";
			const count = ref(p.count, 4);
			const spacing = ref(p.spacing, 20);
			const axis = p.axis || "X";
			return `const ${varName} = (() => {\n  const items = [${prevVar}];\n  for (let i = 1; i < ${count}; i++) {\n    const offset = i * ${spacing};\n    items.push(${prevVar}.translate(${axis === "X" ? "offset, 0, 0" : axis === "Y" ? "0, offset, 0" : "0, 0, offset"}));\n  }\n  return compoundShapes(...items);\n})();`;
		}

		case "transform": {
			if (!prevVar) return "";
			const tx = ref(p.translateX, 0);
			const ty = ref(p.translateY, 0);
			const tz = ref(p.translateZ, 0);
			let code = `const ${varName} = ${prevVar}`;
			if (p.translateX || p.translateY || p.translateZ) {
				code += `.translate(${tx}, ${ty}, ${tz})`;
			}
			if (p.rotateAngle) {
				code += `.rotate(${ref(p.rotateAngle, 0)})`;
			}
			code += ";";
			return code;
		}

		case "execute_code":
			if (step.code) {
				// Wrap custom code in IIFE, preserve parameter references
				return `const ${varName} = (() => {\n  ${step.code.trim().split("\n").join("\n  ")}\n})();`;
			}
			return "";

		case "sweep":
			if (!prevVar) return "";
			return `const ${varName} = ${prevVar}.sweepSketch((plane, origin) => ${prevVar});`;

		case "loft":
			return `const ${varName} = loftSketches(/* profiles */);`;

		case "splice":
			// Splice is handled separately via the splicer engine
			return "// Splice operation — processed by splicer engine";

		case "add_connection_point":
			return `// Connection point: ${p.name || "unnamed"} at (${ref(p.x, 0)}, ${ref(p.y, 0)}, ${ref(p.z, 0)})`;

		default:
			return "";
	}
}

/**
 * Format a value reference — if it's a string starting with ${ it's a param ref,
 * otherwise use the literal value or fallback.
 */
function ref(value: unknown, fallback: unknown): string {
	if (value === undefined || value === null) return String(fallback);
	const s = String(value);
	// If it's a param reference like "${width}", keep it for template substitution
	if (s.startsWith("${") && s.endsWith("}")) return s;
	return s;
}

// ─── Parameter Substitution ────────────────────────────────────

/**
 * Substitute parameter values into a compiled macro code template.
 */
export function substituteMacroParams(
	codeTemplate: string,
	paramValues: Record<string, unknown>,
): string {
	let code = codeTemplate;
	for (const [name, value] of Object.entries(paramValues)) {
		const pattern = new RegExp(`\\$\\{${escapeRegex(name)}\\}`, "g");
		code = code.replace(pattern, String(value));
	}
	return code;
}

function escapeRegex(str: string): string {
	return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ─── Macro Execution ───────────────────────────────────────────

/**
 * Execute a macro with given parameter values.
 * Returns the generated code (does NOT run it in the engine — caller does that).
 */
export function executeMacro(
	macro: MacroDefinition,
	paramValues: Record<string, unknown>,
): MacroExecution {
	const startTime = performance.now();

	try {
		// Compile the macro to a code template
		const template = compileMacro(macro);

		// Build the full parameter set with defaults for missing values
		const fullParams: Record<string, unknown> = {};
		for (const param of macro.parameters) {
			fullParams[param.name] = paramValues[param.name] ?? param.defaultValue;
		}

		// Substitute parameters
		const generatedCode = substituteMacroParams(template, fullParams);

		const duration = Math.round(performance.now() - startTime);

		return {
			id: crypto.randomUUID(),
			macroId: macro.id,
			macroName: macro.name,
			parameterValues: fullParams,
			generatedCode,
			status: "completed",
			executedAt: Date.now(),
			duration,
		};
	} catch (err) {
		const duration = Math.round(performance.now() - startTime);
		return {
			id: crypto.randomUUID(),
			macroId: macro.id,
			macroName: macro.name,
			parameterValues: paramValues,
			generatedCode: "",
			status: "failed",
			error: err instanceof Error ? err.message : "Macro execution failed",
			executedAt: Date.now(),
			duration,
		};
	}
}

// ─── Parameter Sweep / Mass Part Generation ────────────────────

/**
 * Generate all parameter combinations from a set of sweeps (cross product).
 */
export function generateSweepCombinations(
	sweeps: ParameterSweep[],
	baseParams: Record<string, unknown>,
): Record<string, unknown>[] {
	if (sweeps.length === 0) return [{ ...baseParams }];

	// Generate values for each sweep
	const sweepValues: Array<{ paramName: string; values: unknown[] }> = [];

	for (const sweep of sweeps) {
		const values = generateSweepValues(sweep);
		sweepValues.push({ paramName: sweep.paramName, values });
	}

	// Cross product
	let combinations: Record<string, unknown>[] = [{ ...baseParams }];

	for (const { paramName, values } of sweepValues) {
		const expanded: Record<string, unknown>[] = [];
		for (const combo of combinations) {
			for (const val of values) {
				expanded.push({ ...combo, [paramName]: val });
			}
		}
		combinations = expanded;
	}

	return combinations;
}

function generateSweepValues(sweep: ParameterSweep): unknown[] {
	switch (sweep.sweepType) {
		case "linear": {
			const start = sweep.start ?? 0;
			const end = sweep.end ?? 100;
			const count = sweep.count ?? 5;
			const step = (end - start) / Math.max(1, count - 1);
			return Array.from({ length: count }, (_, i) => start + i * step);
		}

		case "logarithmic": {
			const start = Math.max(0.001, sweep.start ?? 1);
			const end = sweep.end ?? 100;
			const count = sweep.count ?? 5;
			const logStart = Math.log10(start);
			const logEnd = Math.log10(end);
			const logStep = (logEnd - logStart) / Math.max(1, count - 1);
			return Array.from(
				{ length: count },
				(_, i) => Math.round(10 ** (logStart + i * logStep) * 100) / 100,
			);
		}

		case "list":
			return sweep.values ?? [];

		case "random": {
			const min = sweep.min ?? 0;
			const max = sweep.max ?? 100;
			const count = sweep.count ?? 5;
			return Array.from(
				{ length: count },
				() => Math.round((min + Math.random() * (max - min)) * 100) / 100,
			);
		}

		default:
			return [];
	}
}

/**
 * Create a batch job from a batch config.
 */
export function createBatchJob(
	config: BatchConfig,
	macro: MacroDefinition,
): BatchJob {
	// Get default parameter values
	const baseParams: Record<string, unknown> = {};
	for (const param of macro.parameters) {
		baseParams[param.name] = param.defaultValue;
	}

	// Generate all combinations
	const combinations = generateSweepCombinations(config.sweeps, baseParams);

	// Create rows
	const rows: BatchParameterRow[] = combinations.map((values, index) => {
		// Apply naming template
		let partName = config.namingTemplate;
		for (const [key, val] of Object.entries(values)) {
			partName = partName.replace(
				new RegExp(`\\$\\{${escapeRegex(key)}\\}`, "g"),
				String(val),
			);
		}
		partName = partName.replace(/\$\{index\}/g, String(index));

		return {
			index,
			values,
			partName,
			status: "pending",
		};
	});

	return {
		id: crypto.randomUUID(),
		name: `Batch: ${macro.name}`,
		description: `${rows.length} parts from ${config.sweeps.length} parameter sweep(s)`,
		macroId: macro.id,
		macroName: macro.name,
		rows,
		status: "draft",
		progress: 0,
		autoExport: false,
		storeParts: true,
		storeCategory: macro.category,
		storeTags: macro.tags,
		createdAt: Date.now(),
		updatedAt: Date.now(),
	};
}

/**
 * Execute a single row of a batch job.
 * Returns the execution result (code generated, not run in engine).
 */
export function executeBatchRow(
	macro: MacroDefinition,
	row: BatchParameterRow,
): { code: string; error?: string } {
	try {
		const execution = executeMacro(macro, row.values);
		if (execution.status === "failed") {
			return { code: "", error: execution.error };
		}
		return { code: execution.generatedCode };
	} catch (err) {
		return {
			code: "",
			error: err instanceof Error ? err.message : "Row execution failed",
		};
	}
}

// ─── Macro Recording Helpers ───────────────────────────────────

/**
 * Create a macro step from a feature operation.
 */
export function featureToMacroStep(
	type: MacroStep["type"],
	label: string,
	params: Record<string, unknown>,
	code?: string,
): MacroStep {
	return {
		id: crypto.randomUUID(),
		type,
		label,
		params,
		code,
		enabled: true,
	};
}

/**
 * Infer macro parameters from step params.
 * Finds numeric values and exposes them as configurable parameters.
 */
export function inferMacroParams(steps: MacroStep[]): MacroParam[] {
	const params: MacroParam[] = [];
	const seen = new Set<string>();

	for (const step of steps) {
		for (const [key, value] of Object.entries(step.params)) {
			if (typeof value === "number" && !seen.has(key)) {
				seen.add(key);
				params.push({
					id: crypto.randomUUID(),
					name: key,
					label: key
						.replace(/([A-Z])/g, " $1")
						.replace(/^./, (s) => s.toUpperCase()),
					type: "number",
					defaultValue: value,
					unit: guessUnit(key),
				});
			}
		}
	}

	return params;
}

function guessUnit(paramName: string): string {
	const name = paramName.toLowerCase();
	if (
		name.includes("angle") ||
		name.includes("rotation") ||
		name.includes("twist")
	)
		return "deg";
	if (name.includes("count") || name.includes("sides")) return "";
	return "mm";
}

// ─── Built-in Macro Templates ──────────────────────────────────

export const BUILTIN_MACROS: MacroDefinition[] = [
	{
		id: "macro-parametric-bracket",
		name: "Parametric L-Bracket",
		description: "Configurable L-bracket with mounting holes",
		version: 1,
		parameters: [
			{
				id: "p1",
				name: "baseWidth",
				label: "Base Width",
				type: "number",
				defaultValue: 60,
				min: 20,
				max: 200,
				unit: "mm",
			},
			{
				id: "p2",
				name: "baseDepth",
				label: "Base Depth",
				type: "number",
				defaultValue: 40,
				min: 10,
				max: 150,
				unit: "mm",
			},
			{
				id: "p3",
				name: "wallHeight",
				label: "Wall Height",
				type: "number",
				defaultValue: 45,
				min: 15,
				max: 200,
				unit: "mm",
			},
			{
				id: "p4",
				name: "thickness",
				label: "Thickness",
				type: "number",
				defaultValue: 5,
				min: 2,
				max: 20,
				unit: "mm",
			},
			{
				id: "p5",
				name: "holeDiameter",
				label: "Hole Diameter",
				type: "number",
				defaultValue: 6,
				min: 2,
				max: 30,
				unit: "mm",
			},
			{
				id: "p6",
				name: "filletRadius",
				label: "Fillet Radius",
				type: "number",
				defaultValue: 3,
				min: 0,
				max: 15,
				unit: "mm",
			},
		],
		steps: [
			{
				id: "s1",
				type: "execute_code",
				label: "Generate bracket",
				params: {},
				code: `const base = makeBaseBox(\${baseWidth}, \${baseDepth}, \${thickness});
const wall = makeBaseBox(\${thickness}, \${baseDepth}, \${wallHeight}).translate(\${baseWidth}/2 - \${thickness}/2, 0, \${wallHeight}/2 - \${thickness}/2);
let shape = base.fuse(wall).fillet(\${filletRadius}, (e) => e.inDirection("Y"));
const hole1 = makeCylinder(\${holeDiameter}/2, \${thickness} * 2).translate(-\${baseWidth}/4, 0, 0);
const hole2 = makeCylinder(\${holeDiameter}/2, \${thickness} * 2).translate(\${baseWidth}/4 - \${thickness}, 0, 0);
shape = shape.cut(hole1).cut(hole2);
return shape;`,
				enabled: true,
			},
		],
		category: "Structural",
		tags: ["bracket", "mounting", "parametric"],
		generatesSplicerPoints: true,
		createdAt: Date.now(),
		updatedAt: Date.now(),
	},
	{
		id: "macro-pipe-section",
		name: "Pipe Section with Flanges",
		description:
			"Pipe segment with configurable flange connections at both ends",
		version: 1,
		parameters: [
			{
				id: "p1",
				name: "outerDiameter",
				label: "Outer Diameter",
				type: "number",
				defaultValue: 50,
				min: 10,
				max: 500,
				unit: "mm",
			},
			{
				id: "p2",
				name: "wallThickness",
				label: "Wall Thickness",
				type: "number",
				defaultValue: 3,
				min: 1,
				max: 30,
				unit: "mm",
			},
			{
				id: "p3",
				name: "length",
				label: "Length",
				type: "number",
				defaultValue: 100,
				min: 20,
				max: 2000,
				unit: "mm",
			},
			{
				id: "p4",
				name: "flangeWidth",
				label: "Flange Width",
				type: "number",
				defaultValue: 15,
				min: 5,
				max: 50,
				unit: "mm",
			},
			{
				id: "p5",
				name: "flangeThickness",
				label: "Flange Thickness",
				type: "number",
				defaultValue: 8,
				min: 3,
				max: 20,
				unit: "mm",
			},
			{
				id: "p6",
				name: "boltHoles",
				label: "Bolt Holes",
				type: "number",
				defaultValue: 4,
				min: 2,
				max: 12,
				unit: "",
			},
			{
				id: "p7",
				name: "boltDiameter",
				label: "Bolt Hole Diameter",
				type: "number",
				defaultValue: 8,
				min: 3,
				max: 20,
				unit: "mm",
			},
		],
		steps: [
			{
				id: "s1",
				type: "execute_code",
				label: "Generate pipe with flanges",
				params: {},
				code: `const outerR = \${outerDiameter} / 2;
const innerR = outerR - \${wallThickness};
const flangeR = outerR + \${flangeWidth};

// Main pipe body
const outer = makeCylinder(outerR, \${length});
const inner = makeCylinder(innerR, \${length} + 2).translate(0, 0, -1);
let shape = outer.cut(inner);

// Bottom flange
const flange1 = makeCylinder(flangeR, \${flangeThickness});
const flange1hole = makeCylinder(innerR, \${flangeThickness} + 2).translate(0, 0, -1);
shape = shape.fuse(flange1.cut(flange1hole));

// Top flange
const flange2 = makeCylinder(flangeR, \${flangeThickness}).translate(0, 0, \${length} - \${flangeThickness});
const flange2hole = makeCylinder(innerR, \${flangeThickness} + 2).translate(0, 0, \${length} - \${flangeThickness} - 1);
shape = shape.fuse(flange2.cut(flange2hole));

// Bolt holes on both flanges
const boltCircleR = outerR + \${flangeWidth} / 2;
for (let i = 0; i < \${boltHoles}; i++) {
  const angle = (i * 360 / \${boltHoles}) * Math.PI / 180;
  const x = boltCircleR * Math.cos(angle);
  const y = boltCircleR * Math.sin(angle);
  const bh1 = makeCylinder(\${boltDiameter}/2, \${flangeThickness} + 2).translate(x, y, -1);
  const bh2 = makeCylinder(\${boltDiameter}/2, \${flangeThickness} + 2).translate(x, y, \${length} - \${flangeThickness} - 1);
  shape = shape.cut(bh1).cut(bh2);
}

return shape;`,
				enabled: true,
			},
		],
		category: "Piping",
		tags: ["pipe", "flange", "parametric", "splicer"],
		generatesSplicerPoints: true,
		createdAt: Date.now(),
		updatedAt: Date.now(),
	},
	{
		id: "macro-fastener-array",
		name: "Fastener Hole Array",
		description:
			"Generate a pattern of mounting holes for mass fastener placement",
		version: 1,
		parameters: [
			{
				id: "p1",
				name: "rows",
				label: "Rows",
				type: "number",
				defaultValue: 3,
				min: 1,
				max: 50,
				unit: "",
			},
			{
				id: "p2",
				name: "cols",
				label: "Columns",
				type: "number",
				defaultValue: 4,
				min: 1,
				max: 50,
				unit: "",
			},
			{
				id: "p3",
				name: "spacingX",
				label: "X Spacing",
				type: "number",
				defaultValue: 25,
				min: 5,
				max: 200,
				unit: "mm",
			},
			{
				id: "p4",
				name: "spacingY",
				label: "Y Spacing",
				type: "number",
				defaultValue: 25,
				min: 5,
				max: 200,
				unit: "mm",
			},
			{
				id: "p5",
				name: "holeDiameter",
				label: "Hole Diameter",
				type: "number",
				defaultValue: 6,
				min: 1,
				max: 50,
				unit: "mm",
			},
			{
				id: "p6",
				name: "plateThickness",
				label: "Plate Thickness",
				type: "number",
				defaultValue: 5,
				min: 1,
				max: 50,
				unit: "mm",
			},
			{
				id: "p7",
				name: "marginX",
				label: "X Margin",
				type: "number",
				defaultValue: 15,
				min: 5,
				max: 50,
				unit: "mm",
			},
			{
				id: "p8",
				name: "marginY",
				label: "Y Margin",
				type: "number",
				defaultValue: 15,
				min: 5,
				max: 50,
				unit: "mm",
			},
		],
		steps: [
			{
				id: "s1",
				type: "execute_code",
				label: "Generate hole array plate",
				params: {},
				code: `const plateW = (\${cols} - 1) * \${spacingX} + 2 * \${marginX};
const plateD = (\${rows} - 1) * \${spacingY} + 2 * \${marginY};
let shape = makeBaseBox(plateW, plateD, \${plateThickness});

for (let r = 0; r < \${rows}; r++) {
  for (let c = 0; c < \${cols}; c++) {
    const x = -plateW/2 + \${marginX} + c * \${spacingX};
    const y = -plateD/2 + \${marginY} + r * \${spacingY};
    const hole = makeCylinder(\${holeDiameter}/2, \${plateThickness} + 2).translate(x, y, -1);
    shape = shape.cut(hole);
  }
}

return shape;`,
				enabled: true,
			},
		],
		category: "Fasteners",
		tags: ["holes", "pattern", "array", "mounting", "parametric"],
		generatesSplicerPoints: false,
		createdAt: Date.now(),
		updatedAt: Date.now(),
	},
];
