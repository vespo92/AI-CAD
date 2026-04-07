/**
 * Layer Classifier
 *
 * Automatically classifies CAD layers by their semantic purpose using
 * heuristics based on layer name, linetype, color, and entity composition.
 *
 * Classification strategy (in priority order):
 * 1. Layer name pattern matching (most reliable)
 * 2. Linetype analysis (DASHED → hidden, CENTER → centerlines)
 * 3. Entity composition (all text → annotations, all hatches → section)
 * 4. Color conventions (common CAD color standards)
 */

import type {
	ClassificationConfidence,
	ClassifiedLayer,
	DxfEntity,
	LayerClassification,
} from "./types";

interface ClassificationResult {
	classification: LayerClassification;
	confidence: ClassificationConfidence;
	reason: string;
}

/**
 * Classify a layer based on its properties and entities.
 */
export function classifyLayer(layer: ClassifiedLayer): ClassificationResult {
	// Try each strategy in order of reliability
	const nameResult = classifyByName(layer.name);
	if (nameResult) return nameResult;

	const linetypeResult = classifyByLinetype(layer.linetype);
	if (linetypeResult) return linetypeResult;

	const entityResult = classifyByEntities(layer.entities);
	if (entityResult) return entityResult;

	const colorResult = classifyByColor(layer.colorIndex);
	if (colorResult) return colorResult;

	// Default: if the layer has geometric entities, it's likely visible outline
	const hasGeometry = layer.entities.some((e) =>
		[
			"line",
			"circle",
			"arc",
			"polyline",
			"lwpolyline",
			"spline",
			"ellipse",
		].includes(e.type),
	);

	if (hasGeometry) {
		return {
			classification: "visible-outline",
			confidence: "low",
			reason:
				"Default: layer contains geometric entities with no distinguishing characteristics",
		};
	}

	return {
		classification: "unknown",
		confidence: "low",
		reason: "Could not determine layer purpose from available information",
	};
}

// ─── Name-Based Classification ─────────────────────────────────

const NAME_PATTERNS: [RegExp, LayerClassification, string][] = [
	// Hidden lines
	[/\bhid(den)?\b/i, "hidden-lines", "Layer name contains 'hidden'"],
	[/\bdash(ed)?\b/i, "hidden-lines", "Layer name contains 'dashed'"],
	[/\binvisible\b/i, "hidden-lines", "Layer name contains 'invisible'"],
	[/\bHIDDEN\b/, "hidden-lines", "Layer name is 'HIDDEN' (standard)"],
	[
		/^H[-_]?LINES?$/i,
		"hidden-lines",
		"Layer name matches hidden line convention",
	],

	// Centerlines
	[/\bcent(er|re)?\s*l/i, "centerlines", "Layer name contains 'center line'"],
	[/\bcl\b/i, "centerlines", "Layer name abbreviation 'CL' (centerline)"],
	[/\baxis\b/i, "centerlines", "Layer name contains 'axis'"],
	[/\bsymmetr/i, "centerlines", "Layer name contains 'symmetry'"],
	[
		/^C[-_]?LINES?$/i,
		"centerlines",
		"Layer name matches centerline convention",
	],

	// Dimensions
	[/\bdim(ension)?s?\b/i, "dimensions", "Layer name contains 'dimension'"],
	[/\bmeasure/i, "dimensions", "Layer name contains 'measure'"],
	[/\bannotation/i, "annotations", "Layer name contains 'annotation'"],
	[/\bnotes?\b/i, "annotations", "Layer name contains 'note'"],
	[/\btext\b/i, "annotations", "Layer name contains 'text'"],
	[/\blabel/i, "annotations", "Layer name contains 'label'"],

	// Section hatching
	[/\bhatch/i, "section-hatching", "Layer name contains 'hatch'"],
	[/\bsection/i, "section-hatching", "Layer name contains 'section'"],
	[/\bx-?sect/i, "section-hatching", "Layer name contains 'cross-section'"],
	[
		/\bcross\s*sect/i,
		"section-hatching",
		"Layer name contains 'cross section'",
	],

	// Construction
	[/\bconstruct/i, "construction", "Layer name contains 'construction'"],
	[/\breference\b/i, "construction", "Layer name contains 'reference'"],
	[/\bguide/i, "construction", "Layer name contains 'guide'"],
	[/\btemp\b/i, "construction", "Layer name contains 'temp'"],
	[/\bsketch\b/i, "construction", "Layer name contains 'sketch'"],

	// Phantom
	[/\bphantom\b/i, "phantom", "Layer name contains 'phantom'"],
	[/\balternate\b/i, "phantom", "Layer name contains 'alternate'"],

	// Cutting plane
	[/\bcutting/i, "cutting-plane", "Layer name contains 'cutting'"],
	[/\bcut\s*plane/i, "cutting-plane", "Layer name contains 'cut plane'"],

	// Visible outline (common names)
	[/\boutline/i, "visible-outline", "Layer name contains 'outline'"],
	[/\bvisible\b/i, "visible-outline", "Layer name contains 'visible'"],
	[/\bobject\b/i, "visible-outline", "Layer name contains 'object'"],
	[/\bprofile\b/i, "visible-outline", "Layer name contains 'profile'"],
	[/\bcontour\b/i, "visible-outline", "Layer name contains 'contour'"],
	[/\bborder\b/i, "visible-outline", "Layer name contains 'border'"],
	[/\bgeom/i, "visible-outline", "Layer name contains 'geometry'"],

	// Detail/break
	[/\bdetail\b/i, "detail-boundary", "Layer name contains 'detail'"],
	[/\bbreak/i, "break-lines", "Layer name contains 'break'"],
];

function classifyByName(name: string): ClassificationResult | null {
	for (const [pattern, classification, reason] of NAME_PATTERNS) {
		if (pattern.test(name)) {
			return { classification, confidence: "high", reason };
		}
	}

	// Check AIA/CSI layer naming conventions (e.g., A-WALL-FULL, M-DUCT-HIDN)
	const aiaMatch = name.match(
		/^[A-Z]-[A-Z]+-?(FULL|HIDN|CNTR|DIMS?|NOTE|TEXT|HATCH|SECT|PATT|CONS|PHNT)/i,
	);
	if (aiaMatch) {
		const suffix = aiaMatch[1].toUpperCase();
		const aiaMap: Record<string, LayerClassification> = {
			FULL: "visible-outline",
			HIDN: "hidden-lines",
			CNTR: "centerlines",
			DIM: "dimensions",
			DIMS: "dimensions",
			NOTE: "annotations",
			TEXT: "annotations",
			HATCH: "section-hatching",
			SECT: "section-hatching",
			PATT: "section-hatching",
			CONS: "construction",
			PHNT: "phantom",
		};
		if (aiaMap[suffix]) {
			return {
				classification: aiaMap[suffix],
				confidence: "high",
				reason: `AIA layer naming convention: suffix '${suffix}'`,
			};
		}
	}

	return null;
}

// ─── Linetype-Based Classification ─────────────────────────────

const LINETYPE_MAP: Record<string, [LayerClassification, string]> = {
	DASHED: ["hidden-lines", "Linetype DASHED indicates hidden lines"],
	DASHDOT: ["centerlines", "Linetype DASHDOT indicates centerlines"],
	CENTER: ["centerlines", "Linetype CENTER indicates centerlines"],
	PHANTOM: ["phantom", "Linetype PHANTOM indicates phantom lines"],
	DOT: ["construction", "Linetype DOT indicates construction geometry"],
	BORDER: ["visible-outline", "Linetype BORDER indicates outline"],
	DIVIDE: ["construction", "Linetype DIVIDE indicates construction geometry"],
};

function classifyByLinetype(linetype: string): ClassificationResult | null {
	const upper = linetype.toUpperCase();

	// Direct match
	if (LINETYPE_MAP[upper]) {
		const [classification, reason] = LINETYPE_MAP[upper];
		return { classification, confidence: "high", reason };
	}

	// Partial match (e.g., "HIDDEN2" → hidden)
	if (upper.startsWith("HIDDEN") || upper.includes("DASH")) {
		return {
			classification: "hidden-lines",
			confidence: "medium",
			reason: `Linetype '${linetype}' suggests hidden lines`,
		};
	}
	if (upper.startsWith("CENTER") || upper.includes("DASHDOT")) {
		return {
			classification: "centerlines",
			confidence: "medium",
			reason: `Linetype '${linetype}' suggests centerlines`,
		};
	}
	if (upper.startsWith("PHANTOM")) {
		return {
			classification: "phantom",
			confidence: "medium",
			reason: `Linetype '${linetype}' suggests phantom lines`,
		};
	}

	// CONTINUOUS linetype is default — doesn't help classify
	return null;
}

// ─── Entity Composition Classification ─────────────────────────

function classifyByEntities(
	entities: DxfEntity[],
): ClassificationResult | null {
	if (entities.length === 0) return null;

	const typeCounts = new Map<string, number>();
	for (const e of entities) {
		typeCounts.set(e.type, (typeCounts.get(e.type) ?? 0) + 1);
	}

	const total = entities.length;
	const textCount =
		(typeCounts.get("text") ?? 0) + (typeCounts.get("mtext") ?? 0);
	const dimCount = typeCounts.get("dimension") ?? 0;
	const hatchCount = typeCounts.get("hatch") ?? 0;

	// If > 80% text/mtext entities, it's annotations
	if (textCount / total > 0.8) {
		return {
			classification: "annotations",
			confidence: "medium",
			reason: `${Math.round((textCount / total) * 100)}% of entities are text`,
		};
	}

	// If > 50% dimensions, it's a dimension layer
	if (dimCount / total > 0.5) {
		return {
			classification: "dimensions",
			confidence: "medium",
			reason: `${Math.round((dimCount / total) * 100)}% of entities are dimensions`,
		};
	}

	// If contains hatches, likely section
	if (hatchCount > 0 && hatchCount / total > 0.3) {
		return {
			classification: "section-hatching",
			confidence: "medium",
			reason: `Layer contains ${hatchCount} hatch entities`,
		};
	}

	return null;
}

// ─── Color-Based Classification ────────────────────────────────

/**
 * Common AutoCAD color index (ACI) conventions.
 * These vary by organization but some patterns are widespread.
 */
function classifyByColor(colorIndex: number): ClassificationResult | null {
	// Color 1 (red) is sometimes used for dimensions
	// Color 2 (yellow) is sometimes construction
	// Color 3 (green) is sometimes centerlines
	// Color 4 (cyan) is sometimes hidden lines
	// Color 7 (white/black) is default, no signal

	// These are weak signals, so low confidence
	switch (colorIndex) {
		case 3: // green — sometimes centerlines
			return {
				classification: "centerlines",
				confidence: "low",
				reason: "Color index 3 (green) is often used for centerlines",
			};
		case 4: // cyan — sometimes hidden
			return {
				classification: "hidden-lines",
				confidence: "low",
				reason: "Color index 4 (cyan) is often used for hidden lines",
			};
		default:
			return null;
	}
}

/**
 * Batch-classify layers with cross-layer context awareness.
 * For example, if one layer is clearly "visible-outline", adjacent layers
 * with dashed linetypes are more likely "hidden-lines".
 */
export function classifyLayersWithContext(
	layers: ClassifiedLayer[],
): ClassifiedLayer[] {
	// First pass: classify individually
	for (const layer of layers) {
		const result = classifyLayer(layer);
		layer.classification = result.classification;
		layer.confidence = result.confidence;
		layer.classificationReason = result.reason;
	}

	// Second pass: contextual refinement
	const hasOutline = layers.some(
		(l) => l.classification === "visible-outline" && l.confidence !== "low",
	);

	if (hasOutline) {
		// If we have a confident outline layer, boost confidence of related layers
		for (const layer of layers) {
			if (layer.confidence === "low" && layer.classification !== "unknown") {
				layer.confidence = "medium";
				layer.classificationReason +=
					" (boosted: outline layer exists in drawing)";
			}
		}
	}

	return layers;
}
