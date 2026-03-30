/**
 * Feature-Based Parametric Code Generator
 *
 * Converts a feature tree into executable Replicad code.
 * Each feature maps to a code snippet; the full model is composed
 * by replaying features in order, respecting visibility/suppression.
 */

import type { Feature, FeatureType } from "@/types/cad";

/**
 * Generate complete Replicad code from a feature list.
 * Suppressed/invisible features are skipped.
 */
export function generateCodeFromFeatures(features: Feature[]): string {
	const activeFeatures = features.filter((f) => f.visible && !f.suppressed);

	if (activeFeatures.length === 0) {
		return "// No active features\nconst shape = makeBaseBox(1, 1, 1);\nreturn shape;";
	}

	const lines: string[] = [];
	let currentVar = "";

	for (let i = 0; i < activeFeatures.length; i++) {
		const feature = activeFeatures[i];
		const varName = `f${i}`;
		const code = generateFeatureCode(feature, currentVar, varName);

		if (code) {
			lines.push(`// Feature: ${feature.name}`);
			lines.push(code);
			currentVar = varName;
		}
	}

	if (currentVar) {
		lines.push(`\nreturn ${currentVar};`);
	}

	return lines.join("\n");
}

function generateFeatureCode(
	feature: Feature,
	prevVar: string,
	varName: string,
): string {
	// If the feature has custom code, use it directly
	if (feature.code) {
		// Replace generic return/shape references with our variable
		let code = feature.code.trim();
		// Replace `return shape` or `return result` at end
		code = code.replace(/return\s+\w+\s*;?\s*$/, "");
		// Wrap in variable assignment
		return `const ${varName} = (() => {\n  ${code.split("\n").join("\n  ")}\n  return shape ?? result ?? model;\n})();`;
	}

	const p = feature.params as Record<string, number>;

	switch (feature.type) {
		case "sketch":
			return generateSketchCode(feature, varName);
		case "extrude":
			return generateExtrudeCode(feature, prevVar, varName);
		case "revolve":
			return `const ${varName} = ${prevVar || "sketch"}.revolve();`;
		case "fillet":
			if (!prevVar) return "";
			return `const ${varName} = ${prevVar}.fillet(${p.radius || 2}, (e) => e${p.direction ? `.inDirection("${p.direction}")` : ""});`;
		case "chamfer":
			if (!prevVar) return "";
			return `const ${varName} = ${prevVar}.chamfer(${p.distance || 1}, (e) => e);`;
		case "shell":
			if (!prevVar) return "";
			return `const ${varName} = ${prevVar}.shell(${p.thickness || 2}, (f) => f);`;
		case "boolean-fuse":
			return generateBooleanCode("fuse", feature, prevVar, varName);
		case "boolean-cut":
			return generateBooleanCode("cut", feature, prevVar, varName);
		case "boolean-common":
			return generateBooleanCode("common", feature, prevVar, varName);
		case "mirror":
			if (!prevVar) return "";
			return `const ${varName} = ${prevVar}.mirror("${p.plane || "XY"}");`;
		case "pattern":
			return generatePatternCode(feature, prevVar, varName);
		default:
			return generatePrimitiveCode(feature, varName);
	}
}

function generateSketchCode(feature: Feature, varName: string): string {
	const p = feature.params as Record<string, unknown>;
	const shapeType = (p.shape as string) || "rectangle";
	const plane = (p.plane as string) || "XY";
	const w = (p.width as number) || 40;
	const h = (p.height as number) || 30;
	const r = (p.radius as number) || 20;

	switch (shapeType) {
		case "rectangle":
			return `const ${varName} = drawRoundedRectangle(${w}, ${h}, ${(p.cornerRadius as number) || 0}).sketchOnPlane("${plane}");`;
		case "circle":
			return `const ${varName} = drawCircle(${r}).sketchOnPlane("${plane}");`;
		case "polygon":
			return `const ${varName} = drawPolysides(${r}, ${(p.sides as number) || 6}).sketchOnPlane("${plane}");`;
		default:
			return `const ${varName} = drawRoundedRectangle(${w}, ${h}, 0).sketchOnPlane("${plane}");`;
	}
}

function generateExtrudeCode(
	feature: Feature,
	prevVar: string,
	varName: string,
): string {
	const p = feature.params as Record<string, number>;
	const height = p.height || 20;

	if (prevVar) {
		return `const ${varName} = ${prevVar}.extrude(${height});`;
	}
	// Standalone extrude from default sketch
	const w = p.width || 40;
	const d = p.depth || 30;
	return `const ${varName} = drawRoundedRectangle(${w}, ${d}, 0).sketchOnPlane("XY").extrude(${height});`;
}

function generateBooleanCode(
	op: "fuse" | "cut" | "common",
	feature: Feature,
	prevVar: string,
	varName: string,
): string {
	if (!prevVar) return "";
	const p = feature.params as Record<string, unknown>;
	const toolCode = (p.toolCode as string) || "makeBaseBox(10, 10, 10)";
	return `const ${varName}_tool = ${toolCode};\nconst ${varName} = ${prevVar}.${op}(${varName}_tool);`;
}

function generatePatternCode(
	feature: Feature,
	prevVar: string,
	varName: string,
): string {
	if (!prevVar) return "";
	const p = feature.params as Record<string, unknown>;
	const count = (p.count as number) || 4;
	const spacing = (p.spacing as number) || 20;
	const axis = (p.axis as string) || "X";

	const items: string[] = [prevVar];
	for (let i = 1; i < count; i++) {
		const offset = i * spacing;
		const translate =
			axis === "X"
				? `${offset}, 0, 0`
				: axis === "Y"
					? `0, ${offset}, 0`
					: `0, 0, ${offset}`;
		items.push(`${prevVar}.translate(${translate})`);
	}

	return `const ${varName} = compoundShapes(${items.join(", ")});`;
}

function generatePrimitiveCode(feature: Feature, varName: string): string {
	const p = feature.params as Record<string, number>;

	switch (feature.type as string) {
		case "box":
			return `const ${varName} = makeBaseBox(${p.width || 50}, ${p.depth || 50}, ${p.height || 20});`;
		case "cylinder":
			return `const ${varName} = makeCylinder(${p.radius || 20}, ${p.height || 50});`;
		case "sphere":
			return `const ${varName} = makeSphere(${p.radius || 25});`;
		default:
			return "";
	}
}

/**
 * Create a new feature with default parameters.
 */
export function createDefaultFeature(
	type: FeatureType,
	name?: string,
): Feature {
	const defaults: Record<string, Record<string, unknown>> = {
		sketch: { shape: "rectangle", plane: "XY", width: 40, height: 30 },
		extrude: { height: 20 },
		revolve: { angle: 360 },
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

	return {
		id: crypto.randomUUID(),
		name:
			name || type.charAt(0).toUpperCase() + type.slice(1).replace(/-/g, " "),
		type,
		visible: true,
		suppressed: false,
		params: defaults[type] || {},
	};
}
