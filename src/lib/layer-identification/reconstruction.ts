/**
 * 3D Reconstruction Pipeline
 *
 * Combines layer classification, isometric analysis, and profile extraction
 * to propose 3D features from a 2D drawing.
 *
 * The pipeline:
 * 1. Parse DXF → classified layers
 * 2. Analyze isometric projection
 * 3. Extract 2D profiles from outline + hidden layers
 * 4. Use dimensions + hidden lines to determine depths/heights
 * 5. Propose extrude/revolve/cut operations
 * 6. Generate replicad code for each proposed feature
 */

import type { Point2D } from "@/types/cad";
import { parseDxfFile } from "./dxf-parser";
import { analyzeIsometricDrawing } from "./isometric-analyzer";
import { extractProfiles } from "./profile-extractor";
import type {
	ClassifiedLayer,
	ExtractedDimension,
	ExtractedProfile,
	IsometricAnalysis,
	ProposedFeature,
	ReconstructionResult,
	SymmetryAxis,
} from "./types";

/**
 * Full 2D-to-3D reconstruction pipeline.
 * Takes raw DXF content, returns classified layers and proposed 3D features.
 */
export function reconstructFrom2D(dxfContent: string): ReconstructionResult {
	const warnings: string[] = [];

	// Step 1: Parse and classify layers
	const layers = parseDxfFile(dxfContent);

	if (layers.length === 0) {
		return {
			layers: [],
			profiles: [],
			proposedFeatures: [],
			warnings: ["No layers found in DXF file"],
		};
	}

	// Step 2: Analyze isometric projection
	const isometricAnalysis = analyzeIsometricDrawing(layers);

	if (isometricAnalysis.confidence === "low") {
		warnings.push(
			"Low confidence in projection detection — results may need manual adjustment",
		);
	}

	// Step 3: Extract profiles
	const profiles = extractProfiles(layers);

	if (profiles.length === 0) {
		warnings.push(
			"No closed profiles could be extracted — the drawing may need cleaner outlines",
		);
	}

	// Step 4: Propose 3D features
	const proposedFeatures = proposeFeatures(profiles, isometricAnalysis, layers);

	// Add warnings about unclassified layers
	const unknownLayers = layers.filter((l) => l.classification === "unknown");
	if (unknownLayers.length > 0) {
		warnings.push(
			`${unknownLayers.length} layer(s) could not be classified: ${unknownLayers.map((l) => l.name).join(", ")}`,
		);
	}

	return {
		layers,
		isometricAnalysis,
		profiles,
		proposedFeatures,
		warnings,
	};
}

/**
 * Propose 3D features from extracted profiles and analysis data.
 */
function proposeFeatures(
	profiles: ExtractedProfile[],
	analysis: IsometricAnalysis,
	_layers: ClassifiedLayer[],
): ProposedFeature[] {
	const features: ProposedFeature[] = [];
	const dimensions = analysis.dimensions;
	const symmetryAxes = analysis.symmetryAxes;

	// Separate outline profiles from hidden features
	const outlineProfiles = profiles.filter(
		(p) => p.sourceClassification === "visible-outline",
	);
	const hiddenProfiles = profiles.filter(
		(p) => p.sourceClassification === "hidden-lines",
	);

	// Strategy: largest outline profile → main extrusion body
	const sortedOutlines = [...outlineProfiles].sort(
		(a, b) => computeProfileArea(b) - computeProfileArea(a),
	);

	if (sortedOutlines.length > 0) {
		const mainProfile = sortedOutlines[0];

		// Check if there's a centerline suggesting revolution
		const revolutionAxis = findRevolutionAxis(mainProfile, symmetryAxes);

		if (revolutionAxis) {
			features.push(proposeRevolve(mainProfile, revolutionAxis, dimensions));
		} else {
			// Default: extrude the main profile
			const depth = estimateDepth(mainProfile, dimensions, analysis);
			features.push(proposeExtrude(mainProfile, depth));
		}

		// Additional outline profiles → secondary extrusions or bosses
		for (let i = 1; i < sortedOutlines.length; i++) {
			const profile = sortedOutlines[i];
			const depth = estimateDepth(profile, dimensions, analysis);
			features.push(proposeExtrude(profile, depth));
		}
	}

	// Hidden profiles → cuts/holes
	for (const hidden of hiddenProfiles) {
		const depth = estimateDepth(hidden, dimensions, analysis);
		features.push(proposeCut(hidden, depth));
	}

	return features;
}

// ─── Feature Proposal Generators ───────────────────────────────

function proposeExtrude(
	profile: ExtractedProfile,
	depth: number,
): ProposedFeature {
	const code = generateExtrudeCode(profile, depth);
	return {
		type: "extrude",
		description: `Extrude ${profile.label} by ${depth}mm`,
		profiles: [profile],
		params: { depth },
		confidence: depth > 0 ? "medium" : "low",
		codePreview: code,
	};
}

function proposeRevolve(
	profile: ExtractedProfile,
	axis: SymmetryAxis,
	_dimensions: ExtractedDimension[],
): ProposedFeature {
	const angle = 360; // Full revolution by default
	const code = generateRevolveCode(profile, axis);
	return {
		type: "revolve",
		description: `Revolve ${profile.label} 360° around ${axis.mappedAxis} axis`,
		profiles: [profile],
		params: { angle, axis: axis.mappedAxis },
		confidence: "medium",
		codePreview: code,
	};
}

function proposeCut(profile: ExtractedProfile, depth: number): ProposedFeature {
	const code = generateCutCode(profile, depth);
	return {
		type: "cut",
		description: `Cut ${profile.label} through ${depth}mm (hidden feature)`,
		profiles: [profile],
		params: { depth },
		confidence: "medium",
		codePreview: code,
	};
}

// ─── Code Generation ───────────────────────────────────────────

function generateExtrudeCode(profile: ExtractedProfile, depth: number): string {
	const contour = profile.contour;
	if (contour.length === 0) return "// Empty profile";

	// Check if profile is approximately circular
	const circleParams = detectCircle(contour);
	if (circleParams) {
		const lines = [`// ${profile.label} — circular extrusion`];
		lines.push(`const sketch = drawCircle(${circleParams.radius.toFixed(2)})`);
		if (circleParams.center.x !== 0 || circleParams.center.y !== 0) {
			lines.push(
				`  .translate(${circleParams.center.x.toFixed(2)}, ${circleParams.center.y.toFixed(2)})`,
			);
		}
		lines.push(`  .sketchOnPlane("${profile.plane}");`);
		lines.push(`const shape = sketch.extrude(${depth.toFixed(2)});`);

		// Add holes as cuts
		for (const hole of profile.holes) {
			const holeCircle = detectCircle(hole);
			if (holeCircle) {
				lines.push(
					"\n// Hole cut",
					`const holeCut = drawCircle(${holeCircle.radius.toFixed(2)})`,
					`  .translate(${holeCircle.center.x.toFixed(2)}, ${holeCircle.center.y.toFixed(2)})`,
					`  .sketchOnPlane("${profile.plane}")`,
					`  .extrude(${(depth + 1).toFixed(2)});`,
					"shape = shape.cut(holeCut);",
				);
			}
		}

		lines.push("return shape;");
		return lines.join("\n");
	}

	// General polygon — use draw() with lineTo
	const lines = [`// ${profile.label} — polygon extrusion`];
	lines.push("const sketch = draw()");
	lines.push(
		`  .movePointerTo([${contour[0].x.toFixed(2)}, ${contour[0].y.toFixed(2)}])`,
	);
	for (let i = 1; i < contour.length; i++) {
		lines.push(
			`  .lineTo([${contour[i].x.toFixed(2)}, ${contour[i].y.toFixed(2)}])`,
		);
	}
	lines.push("  .close()");
	lines.push(`  .sketchOnPlane("${profile.plane}");`);
	lines.push(`const shape = sketch.extrude(${depth.toFixed(2)});`);
	lines.push("return shape;");
	return lines.join("\n");
}

function generateRevolveCode(
	profile: ExtractedProfile,
	axis: SymmetryAxis,
): string {
	const contour = profile.contour;
	if (contour.length === 0) return "// Empty profile";

	const lines = [
		`// ${profile.label} — revolution around ${axis.mappedAxis} axis`,
	];
	lines.push("const sketch = draw()");
	lines.push(
		`  .movePointerTo([${contour[0].x.toFixed(2)}, ${contour[0].y.toFixed(2)}])`,
	);
	for (let i = 1; i < contour.length; i++) {
		lines.push(
			`  .lineTo([${contour[i].x.toFixed(2)}, ${contour[i].y.toFixed(2)}])`,
		);
	}
	lines.push("  .close()");
	lines.push(`  .sketchOnPlane("${profile.plane}");`);
	lines.push("const shape = sketch.revolve();");
	lines.push("return shape;");
	return lines.join("\n");
}

function generateCutCode(profile: ExtractedProfile, depth: number): string {
	const contour = profile.contour;
	if (contour.length === 0) return "// Empty profile";

	const circleParams = detectCircle(contour);
	if (circleParams) {
		return [
			`// ${profile.label} — circular cut (hidden feature)`,
			`const cutSketch = drawCircle(${circleParams.radius.toFixed(2)})`,
			`  .translate(${circleParams.center.x.toFixed(2)}, ${circleParams.center.y.toFixed(2)})`,
			`  .sketchOnPlane("${profile.plane}");`,
			`const cutTool = cutSketch.extrude(${(depth + 1).toFixed(2)});`,
			"// Apply: shape = shape.cut(cutTool);",
		].join("\n");
	}

	const lines = [`// ${profile.label} — polygon cut (hidden feature)`];
	lines.push("const cutSketch = draw()");
	lines.push(
		`  .movePointerTo([${contour[0].x.toFixed(2)}, ${contour[0].y.toFixed(2)}])`,
	);
	for (let i = 1; i < contour.length; i++) {
		lines.push(
			`  .lineTo([${contour[i].x.toFixed(2)}, ${contour[i].y.toFixed(2)}])`,
		);
	}
	lines.push("  .close()");
	lines.push(`  .sketchOnPlane("${profile.plane}");`);
	lines.push(`const cutTool = cutSketch.extrude(${(depth + 1).toFixed(2)});`);
	lines.push("// Apply: shape = shape.cut(cutTool);");
	return lines.join("\n");
}

// ─── Depth Estimation ──────────────────────────────────────────

/**
 * Estimate extrusion depth from available dimension data.
 * Falls back to heuristics if no dimension directly applies.
 */
function estimateDepth(
	profile: ExtractedProfile,
	dimensions: ExtractedDimension[],
	_analysis: IsometricAnalysis,
): number {
	// Try to find a dimension that's perpendicular to the profile plane
	const depthDimensions = dimensions.filter((d) => {
		if (profile.plane === "XY") return Math.abs(d.direction.z) > 0.5;
		if (profile.plane === "XZ") return Math.abs(d.direction.y) > 0.5;
		return Math.abs(d.direction.x) > 0.5; // YZ plane
	});

	if (depthDimensions.length > 0) {
		// Use the first matching dimension
		return depthDimensions[0].value;
	}

	// Heuristic: estimate from profile size (depth ≈ 50% of smallest dimension)
	const bounds = computeProfileBounds(profile);
	const width = bounds.max.x - bounds.min.x;
	const height = bounds.max.y - bounds.min.y;
	const smallestDim = Math.min(width, height);

	return Math.max(smallestDim * 0.5, 10); // Minimum 10mm
}

// ─── Geometry Utilities ────────────────────────────────────────

function computeProfileArea(profile: ExtractedProfile): number {
	const contour = profile.contour;
	let area = 0;
	for (let i = 0; i < contour.length; i++) {
		const j = (i + 1) % contour.length;
		area += contour[i].x * contour[j].y;
		area -= contour[j].x * contour[i].y;
	}
	return Math.abs(area / 2);
}

function computeProfileBounds(profile: ExtractedProfile): {
	min: Point2D;
	max: Point2D;
} {
	const xs = profile.contour.map((p) => p.x);
	const ys = profile.contour.map((p) => p.y);
	return {
		min: { x: Math.min(...xs), y: Math.min(...ys) },
		max: { x: Math.max(...xs), y: Math.max(...ys) },
	};
}

/**
 * Check if a contour is approximately circular.
 * Returns center and radius if it is, null otherwise.
 */
function detectCircle(
	points: Point2D[],
): { center: Point2D; radius: number } | null {
	if (points.length < 8) return null; // Need enough points for a circle

	// Compute centroid
	const cx = points.reduce((s, p) => s + p.x, 0) / points.length;
	const cy = points.reduce((s, p) => s + p.y, 0) / points.length;

	// Compute average distance from centroid
	const distances = points.map((p) =>
		Math.sqrt((p.x - cx) ** 2 + (p.y - cy) ** 2),
	);
	const avgRadius = distances.reduce((s, d) => s + d, 0) / distances.length;

	// Check if all points are within 5% of average radius
	const tolerance = avgRadius * 0.05;
	const isCircular = distances.every(
		(d) => Math.abs(d - avgRadius) < tolerance,
	);

	if (isCircular) {
		return { center: { x: cx, y: cy }, radius: avgRadius };
	}
	return null;
}

/**
 * Check if a profile has a nearby centerline that could be a revolution axis.
 */
function findRevolutionAxis(
	profile: ExtractedProfile,
	axes: SymmetryAxis[],
): SymmetryAxis | null {
	if (axes.length === 0) return null;

	const bounds = computeProfileBounds(profile);
	const centroid = {
		x: (bounds.min.x + bounds.max.x) / 2,
		y: (bounds.min.y + bounds.max.y) / 2,
	};

	// Find an axis that's near or within the profile
	for (const axis of axes) {
		const axisMid = {
			x: (axis.start.x + axis.end.x) / 2,
			y: (axis.start.y + axis.end.y) / 2,
		};

		const dist = Math.sqrt(
			(axisMid.x - centroid.x) ** 2 + (axisMid.y - centroid.y) ** 2,
		);

		const profileSize = Math.max(
			bounds.max.x - bounds.min.x,
			bounds.max.y - bounds.min.y,
		);

		// If axis is within the profile bounds, it's likely a revolution axis
		if (dist < profileSize * 0.6) {
			return axis;
		}
	}

	return null;
}
