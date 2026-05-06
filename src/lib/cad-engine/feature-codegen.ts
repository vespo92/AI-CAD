/**
 * Feature-Based Parametric Code Generator
 *
 * Converts a feature tree into executable Replicad code.
 * Features are replayed in order, each feature either:
 *   - Produces a new "solid" variable (primitives, extrusions, revolves)
 *   - Modifies the current solid (fillet, chamfer, shell, boolean ops)
 *   - Defines a reusable sketch (which later extrude/revolve features consume)
 *
 * Sketches, Origin and default planes are NOT emitted as geometry; they are
 * metadata the workflow uses to drive later features.
 */

import type {
	Feature,
	FeatureType,
	Point2D,
	SketchEntity,
	SketchPlane,
} from "@/types/cad";

/**
 * Generate complete Replicad code from a feature list.
 * Suppressed/invisible features are skipped.
 */
export function generateCodeFromFeatures(features: Feature[]): string {
	const activeFeatures = features.filter((f) => f.visible && !f.suppressed);
	const lines: string[] = [];

	// Track the "current" solid variable and a map of sketchId → sketch var
	let currentSolid = "";
	const sketchVars = new Map<string, string>();
	let solidIdx = 0;
	let sketchIdx = 0;

	for (const feature of activeFeatures) {
		// Skip structural entries — they don't produce geometry
		if (feature.type === "origin" || feature.type === "plane") continue;

		if (feature.type === "sketch") {
			const varName = `sk${sketchIdx++}`;
			const code = generateSketchFromFeature(feature, varName);
			if (code) {
				lines.push(`// ${feature.name}`);
				lines.push(code);
				sketchVars.set(feature.id, varName);
			}
			continue;
		}

		// Feature with custom code override (from chat/code editor)
		if (feature.code) {
			const varName = `s${solidIdx++}`;
			const wrapped = wrapCustomCode(feature.code, varName);
			lines.push(`// ${feature.name}`);
			lines.push(wrapped);
			currentSolid = varName;
			continue;
		}

		const varName = `s${solidIdx++}`;
		const code = generateFeatureCode(
			feature,
			currentSolid,
			varName,
			sketchVars,
		);
		if (code) {
			lines.push(`// ${feature.name}`);
			lines.push(code);
			currentSolid = varName;
		}
	}

	if (!currentSolid) {
		return `${lines.length > 0 ? `${lines.join("\n")}\n\n` : ""}// No solid geometry yet — add a Sketch, then an Extrude/Revolve.\nconst shape = makeBaseBox(1, 1, 1);\nreturn shape;`;
	}

	lines.push("");
	lines.push(`return ${currentSolid};`);
	return lines.join("\n");
}

function wrapCustomCode(code: string, varName: string): string {
	const cleaned = code
		.replace(/^\s*import\s+.*from\s+['"]replicad['"].*$/gm, "")
		.trim()
		.replace(/return\s+([\w$]+)\s*;?\s*$/m, "return $1;");
	return `const ${varName} = (() => {\n  ${cleaned.split("\n").join("\n  ")}\n})();`;
}

function generateFeatureCode(
	feature: Feature,
	prevSolid: string,
	varName: string,
	sketchVars: Map<string, string>,
): string {
	const p = feature.params as Record<string, unknown>;

	switch (feature.type) {
		case "extrude":
		case "extrude-cut":
			return generateExtrudeCode(feature, prevSolid, varName, sketchVars);

		case "revolve":
		case "revolve-cut":
			return generateRevolveCode(feature, prevSolid, varName, sketchVars);

		case "fillet":
			if (!prevSolid) return "";
			return `const ${varName} = ${prevSolid}.fillet(${num(p.radius, 2)});`;

		case "chamfer":
			if (!prevSolid) return "";
			return `const ${varName} = ${prevSolid}.chamfer(${num(p.distance, 1)});`;

		case "shell":
			if (!prevSolid) return "";
			return `const ${varName} = ${prevSolid}.shell(${num(p.thickness, 2)}, (f) => f);`;

		case "boolean-fuse":
			return generateBooleanCode("fuse", feature, prevSolid, varName);
		case "boolean-cut":
			return generateBooleanCode("cut", feature, prevSolid, varName);
		case "boolean-common":
			return generateBooleanCode("common", feature, prevSolid, varName);

		case "mirror":
			if (!prevSolid) return "";
			return `const ${varName} = ${prevSolid}.mirror("${(p.plane as string) || "XY"}", [0,0,0], "clone").fuse(${prevSolid});`;

		case "pattern":
			return generatePatternCode(feature, prevSolid, varName);

		default:
			return generatePrimitiveCode(feature, varName);
	}
}

// ─── Sketch → Drawing code ─────────────────────────────────────

function generateSketchFromFeature(feature: Feature, varName: string): string {
	const sketchData = feature.sketchData;
	const p = feature.params as Record<string, unknown>;
	const plane = (sketchData?.plane ??
		(p.plane as SketchPlane) ??
		"XY") as SketchPlane;

	// If we have serialized sketch entities, compile them to a replicad drawing
	if (sketchData && sketchData.entities.length > 0) {
		return compileSketchEntities(sketchData.entities, plane, varName);
	}

	// Otherwise fall back to the simple parametric sketch shapes
	const shapeType = (p.shape as string) || "rectangle";
	const w = num(p.width, 40);
	const h = num(p.height, 30);
	const r = num(p.radius, 20);

	switch (shapeType) {
		case "rectangle":
			return `const ${varName} = drawRoundedRectangle(${w}, ${h}, ${num(p.cornerRadius, 0)}).sketchOnPlane("${plane}");`;
		case "circle":
			return `const ${varName} = drawCircle(${r}).sketchOnPlane("${plane}");`;
		case "polygon":
			return `const ${varName} = drawPolysides(${r}, ${num(p.sides, 6)}).sketchOnPlane("${plane}");`;
		default:
			return `const ${varName} = drawRoundedRectangle(${w}, ${h}, 0).sketchOnPlane("${plane}");`;
	}
}

/**
 * Compile interactive sketch entities into a single replicad drawing.
 * Rectangles/circles become their own closed drawings; a chain of lines
 * becomes a single polyline closed path.
 */
function compileSketchEntities(
	entities: SketchEntity[],
	plane: SketchPlane,
	varName: string,
): string {
	const parts: string[] = [];
	const lines = entities.filter((e) => e.type === "line");
	const others = entities.filter((e) => e.type !== "line");

	for (const e of others) {
		if (e.type === "rectangle") {
			const s = e.params.start as Point2D;
			const en = e.params.end as Point2D;
			const w = Math.abs(en.x - s.x);
			const h = Math.abs(en.y - s.y);
			const cx = (s.x + en.x) / 2;
			const cy = (s.y + en.y) / 2;
			parts.push(
				`drawRoundedRectangle(${w.toFixed(3)}, ${h.toFixed(3)}, 0).translate(${cx.toFixed(3)}, ${cy.toFixed(3)})`,
			);
		} else if (e.type === "circle") {
			const c = e.params.center as Point2D;
			const r = e.params.radius as number;
			if (Math.abs(c.x) < 1e-3 && Math.abs(c.y) < 1e-3) {
				parts.push(`drawCircle(${r.toFixed(3)})`);
			} else {
				parts.push(
					`drawCircle(${r.toFixed(3)}).translate(${c.x.toFixed(3)}, ${c.y.toFixed(3)})`,
				);
			}
		}
	}

	if (lines.length > 0) {
		const first = lines[0].params.start as Point2D;
		const pathLines: string[] = [];
		pathLines.push(`draw([${first.x.toFixed(3)}, ${first.y.toFixed(3)}])`);
		for (const l of lines) {
			const end = l.params.end as Point2D;
			pathLines.push(`  .lineTo([${end.x.toFixed(3)}, ${end.y.toFixed(3)}])`);
		}
		pathLines.push("  .close()");
		parts.push(pathLines.join("\n"));
	}

	if (parts.length === 0) {
		return `const ${varName} = drawRoundedRectangle(40, 30, 0).sketchOnPlane("${plane}");`;
	}

	if (parts.length === 1) {
		return `const ${varName} = ${parts[0]}.sketchOnPlane("${plane}");`;
	}

	// Fuse multiple drawings into a compound drawing
	const head = parts[0];
	const rest = parts.slice(1).map((p, i) => `const part${i} = ${p};`);
	const fused = parts
		.slice(1)
		.map((_, i) => `part${i}`)
		.reduce((acc, v) => `${acc}.fuse(${v})`, "base");
	return [
		`const base = ${head};`,
		...rest,
		`const ${varName} = ${fused}.sketchOnPlane("${plane}");`,
	].join("\n");
}

// ─── Extrude / Revolve ─────────────────────────────────────────

function generateExtrudeCode(
	feature: Feature,
	prevSolid: string,
	varName: string,
	sketchVars: Map<string, string>,
): string {
	const p = feature.params as Record<string, unknown>;
	const depth = num(p.depth ?? p.height, 20);
	const direction = (p.direction as string) || "normal";
	const isCut = feature.type === "extrude-cut";

	// Find the source sketch var — either by explicit sketchId or fall back to last declared sketch
	let sketchVar: string | undefined;
	if (feature.sketchId && sketchVars.has(feature.sketchId)) {
		sketchVar = sketchVars.get(feature.sketchId);
	} else if (sketchVars.size > 0) {
		// Fall back to most recent sketch
		const arr = Array.from(sketchVars.values());
		sketchVar = arr[arr.length - 1];
	}

	// No sketch → generate a default rectangle sketch inline
	if (!sketchVar) {
		const w = num(p.width, 40);
		const h = num(p.depth2 ?? p.height2, 30);
		const plane = (p.plane as string) || "XY";
		sketchVar = `${varName}_sk`;
		const header = `const ${sketchVar} = drawRoundedRectangle(${w}, ${h}, 0).sketchOnPlane("${plane}");`;
		const body = buildExtrudeBody(
			sketchVar,
			depth,
			direction,
			isCut,
			prevSolid,
			varName,
		);
		return `${header}\n${body}`;
	}

	return buildExtrudeBody(
		sketchVar,
		depth,
		direction,
		isCut,
		prevSolid,
		varName,
	);
}

function buildExtrudeBody(
	sketchVar: string,
	depth: number,
	direction: string,
	isCut: boolean,
	prevSolid: string,
	varName: string,
): string {
	// Direction: normal = +depth, reverse = -depth, symmetric = ±depth/2, two-side = both
	let extrudeCall: string;
	if (direction === "reverse") {
		extrudeCall = `${sketchVar}.extrude(${-depth})`;
	} else if (direction === "symmetric") {
		extrudeCall = `${sketchVar}.translate(0, 0, ${-depth / 2}).extrude(${depth})`;
	} else {
		extrudeCall = `${sketchVar}.extrude(${depth})`;
	}

	if (isCut) {
		if (!prevSolid) {
			return `const ${varName}_tool = ${extrudeCall};\nconst ${varName} = ${varName}_tool; // WARN: extrude-cut with no existing solid`;
		}
		return `const ${varName}_tool = ${extrudeCall};\nconst ${varName} = ${prevSolid}.cut(${varName}_tool);`;
	}

	// Boss extrude — if there's a previous solid, fuse to it; else start fresh
	if (prevSolid) {
		return `const ${varName}_new = ${extrudeCall};\nconst ${varName} = ${prevSolid}.fuse(${varName}_new);`;
	}
	return `const ${varName} = ${extrudeCall};`;
}

function generateRevolveCode(
	feature: Feature,
	prevSolid: string,
	varName: string,
	sketchVars: Map<string, string>,
): string {
	const p = feature.params as Record<string, unknown>;
	const axis = (p.axis as string) || "Y";
	const angle = num(p.angle, 360);
	const isCut = feature.type === "revolve-cut";

	// Find source sketch
	let sketchVar: string | undefined;
	if (feature.sketchId && sketchVars.has(feature.sketchId)) {
		sketchVar = sketchVars.get(feature.sketchId);
	} else if (sketchVars.size > 0) {
		const arr = Array.from(sketchVars.values());
		sketchVar = arr[arr.length - 1];
	}

	if (!sketchVar) {
		// Default half-profile sketch on XZ plane
		sketchVar = `${varName}_sk`;
		const header = `const ${sketchVar} = drawRoundedRectangle(${num(p.width, 20)}, ${num(p.height, 40)}, 0).translate(${num(p.offset, 15)}, 0).sketchOnPlane("XZ");`;
		const body = buildRevolveBody(
			sketchVar,
			axis,
			angle,
			isCut,
			prevSolid,
			varName,
		);
		return `${header}\n${body}`;
	}

	return buildRevolveBody(sketchVar, axis, angle, isCut, prevSolid, varName);
}

function buildRevolveBody(
	sketchVar: string,
	axis: string,
	angle: number,
	isCut: boolean,
	prevSolid: string,
	varName: string,
): string {
	const axisVec =
		axis === "X" ? "[1, 0, 0]" : axis === "Y" ? "[0, 1, 0]" : "[0, 0, 1]";

	// Replicad's .revolve takes an axis vector. For partial revolves we'd need
	// to generate a swept segment; for now support full 360° and a warning for partial.
	let revolveCall: string;
	if (angle >= 360) {
		revolveCall = `${sketchVar}.revolve(${axisVec})`;
	} else {
		// Partial revolve — replicad's revolve takes (axisVec, config?) but doesn't
		// expose angle directly; use sweepSketch for partial angular sweeps.
		revolveCall = `${sketchVar}.revolve(${axisVec}) /* TODO: partial revolve (${angle}°) */`;
	}

	if (isCut) {
		if (!prevSolid) {
			return `const ${varName} = ${revolveCall}; // WARN: revolve-cut with no existing solid`;
		}
		return `const ${varName}_tool = ${revolveCall};\nconst ${varName} = ${prevSolid}.cut(${varName}_tool);`;
	}

	if (prevSolid) {
		return `const ${varName}_new = ${revolveCall};\nconst ${varName} = ${prevSolid}.fuse(${varName}_new);`;
	}
	return `const ${varName} = ${revolveCall};`;
}

function generateBooleanCode(
	op: "fuse" | "cut" | "common",
	feature: Feature,
	prevSolid: string,
	varName: string,
): string {
	if (!prevSolid) return "";
	const p = feature.params as Record<string, unknown>;
	const toolCode = (p.toolCode as string) || "makeBaseBox(10, 10, 10)";
	return `const ${varName}_tool = ${toolCode};\nconst ${varName} = ${prevSolid}.${op}(${varName}_tool);`;
}

function generatePatternCode(
	feature: Feature,
	prevSolid: string,
	varName: string,
): string {
	if (!prevSolid) return "";
	const p = feature.params as Record<string, unknown>;
	const count = num(p.count, 4);
	const spacing = num(p.spacing, 20);
	const axis = (p.axis as string) || "X";

	const items: string[] = [prevSolid];
	for (let i = 1; i < count; i++) {
		const offset = i * spacing;
		const translate =
			axis === "X"
				? `${offset}, 0, 0`
				: axis === "Y"
					? `0, ${offset}, 0`
					: `0, 0, ${offset}`;
		items.push(`${prevSolid}.clone().translate(${translate})`);
	}

	return `const ${varName} = compoundShapes([${items.join(", ")}]);`;
}

function generatePrimitiveCode(feature: Feature, varName: string): string {
	const p = feature.params as Record<string, number>;

	switch (feature.type as string) {
		case "box":
			return `const ${varName} = makeBaseBox(${num(p.width, 50)}, ${num(p.depth, 50)}, ${num(p.height, 20)});`;
		case "cylinder":
			return `const ${varName} = makeCylinder(${num(p.radius, 20)}, ${num(p.height, 50)});`;
		case "sphere":
			return `const ${varName} = makeSphere(${num(p.radius, 25)});`;
		default:
			return "";
	}
}

function num(value: unknown, fallback: number): number {
	if (typeof value === "number" && !Number.isNaN(value)) return value;
	if (typeof value === "string") {
		const n = Number(value);
		if (!Number.isNaN(n)) return n;
	}
	return fallback;
}

/**
 * Create a new feature with default parameters.
 */
export function createDefaultFeature(
	type: FeatureType,
	name?: string,
): Feature {
	const defaults: Record<string, Record<string, unknown>> = {
		origin: {},
		plane: { plane: "XY" },
		sketch: { shape: "rectangle", plane: "XY", width: 40, height: 30 },
		extrude: { depth: 20, direction: "normal" },
		"extrude-cut": { depth: 20, direction: "normal" },
		revolve: { axis: "Y", angle: 360 },
		"revolve-cut": { axis: "Y", angle: 360 },
		fillet: { radius: 2 },
		chamfer: { distance: 1 },
		shell: { thickness: 2 },
		"boolean-fuse": { toolCode: "makeBaseBox(10, 10, 10)" },
		"boolean-cut": { toolCode: "makeCylinder(5, 30)" },
		"boolean-common": { toolCode: "makeBaseBox(20, 20, 20)" },
		mirror: { plane: "XY" },
		pattern: { count: 4, spacing: 20, axis: "X" },
		sweep: {},
		loft: {},
	};

	const displayNames: Partial<Record<FeatureType, string>> = {
		extrude: "Extruded Boss",
		"extrude-cut": "Extruded Cut",
		revolve: "Revolved Boss",
		"revolve-cut": "Revolved Cut",
		"boolean-fuse": "Combine · Add",
		"boolean-cut": "Combine · Subtract",
		"boolean-common": "Combine · Intersect",
	};

	return {
		id: crypto.randomUUID(),
		name:
			name ||
			displayNames[type] ||
			type.charAt(0).toUpperCase() + type.slice(1).replace(/-/g, " "),
		type,
		visible: true,
		suppressed: false,
		params: defaults[type] || {},
	};
}

/**
 * Build the three default planes and the origin entry used by every new model.
 * These behave like SolidWorks' FeatureManager structural items — non-deletable
 * and used as references for sketches and features.
 */
export function createDefaultStructure(): Feature[] {
	return [
		{
			id: "origin",
			name: "Origin",
			type: "origin",
			visible: true,
			suppressed: false,
			structural: true,
			params: {},
		},
		{
			id: "plane-front",
			name: "Front Plane",
			type: "plane",
			visible: true,
			suppressed: false,
			structural: true,
			params: { plane: "XZ" },
		},
		{
			id: "plane-top",
			name: "Top Plane",
			type: "plane",
			visible: true,
			suppressed: false,
			structural: true,
			params: { plane: "XY" },
		},
		{
			id: "plane-right",
			name: "Right Plane",
			type: "plane",
			visible: true,
			suppressed: false,
			structural: true,
			params: { plane: "YZ" },
		},
	];
}

/** Map a plane feature id to its SketchPlane string */
export function planeFromFeatureId(id: string): SketchPlane | null {
	switch (id) {
		case "plane-front":
			return "XZ";
		case "plane-top":
			return "XY";
		case "plane-right":
			return "YZ";
		default:
			return null;
	}
}
