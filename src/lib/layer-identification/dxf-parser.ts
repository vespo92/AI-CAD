/**
 * DXF File Parser
 *
 * Parses DXF files and extracts entities organized by layer.
 * Uses the dxf-parser library for low-level parsing, then normalizes
 * the data into our internal types.
 */

import DxfParser from "dxf-parser";
import { classifyLayer } from "./layer-classifier";
import type {
	ClassifiedLayer,
	DxfArcEntity,
	DxfCircleEntity,
	DxfDimensionEntity,
	DxfEllipseEntity,
	DxfEntity,
	DxfHatchEntity,
	DxfInsertEntity,
	DxfLineEntity,
	DxfPolylineEntity,
	DxfSplineEntity,
	DxfTextEntity,
} from "./types";

/**
 * Parse a DXF file string and return classified layers with their entities.
 */
export function parseDxfFile(dxfContent: string): ClassifiedLayer[] {
	const parser = new DxfParser();
	const dxf = parser.parseSync(dxfContent);

	if (!dxf) {
		throw new Error("Failed to parse DXF file — no data returned");
	}

	// Build layer map from DXF header/table data
	const layerMap = new Map<string, ClassifiedLayer>();

	// Initialize layers from the LAYERS table
	if (dxf.tables?.layer?.layers) {
		for (const [name, layerDef] of Object.entries(
			dxf.tables.layer.layers as Record<string, DxfLayerDef>,
		)) {
			layerMap.set(name, {
				name,
				colorIndex: layerDef.color ?? 7,
				linetype: layerDef.lineTypeName ?? "CONTINUOUS",
				lineWeight: layerDef.lineWeight ?? -1,
				visible: !layerDef.frozen && layerDef.visible !== false,
				frozen: layerDef.frozen ?? false,
				classification: "unknown",
				confidence: "low",
				classificationReason: "",
				entities: [],
			});
		}
	}

	// Ensure a default "0" layer exists
	if (!layerMap.has("0")) {
		layerMap.set("0", {
			name: "0",
			colorIndex: 7,
			linetype: "CONTINUOUS",
			lineWeight: -1,
			visible: true,
			frozen: false,
			classification: "unknown",
			confidence: "low",
			classificationReason: "",
			entities: [],
		});
	}

	// Parse entities and assign to layers
	if (dxf.entities) {
		for (const rawEntity of dxf.entities) {
			const entity = normalizeEntity(rawEntity);
			if (!entity) continue;

			const layerName = entity.layer || "0";
			if (!layerMap.has(layerName)) {
				// Create layer on-the-fly if not in table
				layerMap.set(layerName, {
					name: layerName,
					colorIndex: 7,
					linetype: "CONTINUOUS",
					lineWeight: -1,
					visible: true,
					frozen: false,
					classification: "unknown",
					confidence: "low",
					classificationReason: "",
					entities: [],
				});
			}
			layerMap.get(layerName)?.entities.push(entity);
		}
	}

	// Classify each layer
	const layers = Array.from(layerMap.values());
	for (const layer of layers) {
		const result = classifyLayer(layer);
		layer.classification = result.classification;
		layer.confidence = result.confidence;
		layer.classificationReason = result.reason;
	}

	return layers;
}

// ─── Entity Normalization ──────────────────────────────────────

interface DxfLayerDef {
	color?: number;
	lineTypeName?: string;
	lineWeight?: number;
	frozen?: boolean;
	visible?: boolean;
}

// biome-ignore lint/suspicious/noExplicitAny: dxf-parser uses loosely typed entities
function normalizeEntity(raw: any): DxfEntity | null {
	const base = {
		layer: raw.layer || "0",
		colorIndex: raw.colorIndex,
		linetype: raw.lineTypeName,
	};

	switch (raw.type) {
		case "LINE":
			return {
				...base,
				type: "line",
				start: { x: raw.vertices?.[0]?.x ?? 0, y: raw.vertices?.[0]?.y ?? 0 },
				end: { x: raw.vertices?.[1]?.x ?? 0, y: raw.vertices?.[1]?.y ?? 0 },
			} satisfies DxfLineEntity;

		case "CIRCLE":
			return {
				...base,
				type: "circle",
				center: { x: raw.center?.x ?? 0, y: raw.center?.y ?? 0 },
				radius: raw.radius ?? 0,
			} satisfies DxfCircleEntity;

		case "ARC":
			return {
				...base,
				type: "arc",
				center: { x: raw.center?.x ?? 0, y: raw.center?.y ?? 0 },
				radius: raw.radius ?? 0,
				startAngle: raw.startAngle ?? 0,
				endAngle: raw.endAngle ?? 360,
			} satisfies DxfArcEntity;

		case "LWPOLYLINE":
		case "POLYLINE":
			return {
				...base,
				type: raw.type === "LWPOLYLINE" ? "lwpolyline" : "polyline",
				vertices: (raw.vertices ?? []).map((v: { x: number; y: number }) => ({
					x: v.x ?? 0,
					y: v.y ?? 0,
				})),
				closed: raw.shape ?? false,
				bulges: (raw.vertices ?? [])
					.map((v: { bulge?: number }) => v.bulge ?? 0)
					.filter((b: number) => b !== 0).length
					? (raw.vertices ?? []).map((v: { bulge?: number }) => v.bulge ?? 0)
					: undefined,
			} satisfies DxfPolylineEntity;

		case "SPLINE":
			return {
				...base,
				type: "spline",
				controlPoints: (raw.controlPoints ?? []).map(
					(p: { x: number; y: number }) => ({
						x: p.x ?? 0,
						y: p.y ?? 0,
					}),
				),
				degree: raw.degreeOfSplineCurve ?? 3,
				closed: raw.closed ?? false,
			} satisfies DxfSplineEntity;

		case "ELLIPSE":
			return {
				...base,
				type: "ellipse",
				center: { x: raw.center?.x ?? 0, y: raw.center?.y ?? 0 },
				majorAxis: {
					x: raw.majorAxisEndPoint?.x ?? 1,
					y: raw.majorAxisEndPoint?.y ?? 0,
				},
				minorAxisRatio: raw.axisRatio ?? 0.5,
				startAngle: raw.startAngle ?? 0,
				endAngle: raw.endAngle ?? Math.PI * 2,
			} satisfies DxfEllipseEntity;

		case "TEXT":
		case "MTEXT":
			return {
				...base,
				type: raw.type === "TEXT" ? "text" : "mtext",
				position: {
					x: raw.startPoint?.x ?? raw.position?.x ?? 0,
					y: raw.startPoint?.y ?? raw.position?.y ?? 0,
				},
				text: raw.text ?? "",
				height: raw.textHeight ?? raw.height ?? 2.5,
				rotation: raw.rotation ?? 0,
			} satisfies DxfTextEntity;

		case "DIMENSION":
			return {
				...base,
				type: "dimension",
				definitionPoint: {
					x: raw.anchorPoint?.x ?? 0,
					y: raw.anchorPoint?.y ?? 0,
				},
				textMidpoint: {
					x: raw.middleOfText?.x ?? 0,
					y: raw.middleOfText?.y ?? 0,
				},
				dimensionText: raw.text ?? "",
				value: extractDimensionValue(raw.text ?? ""),
			} satisfies DxfDimensionEntity;

		case "HATCH":
			return {
				...base,
				type: "hatch",
				patternName: raw.patternName ?? "ANSI31",
				boundaryPaths: normalizeBoundaryPaths(raw.boundaryPaths),
			} satisfies DxfHatchEntity;

		case "INSERT":
			return {
				...base,
				type: "insert",
				blockName: raw.name ?? "",
				position: { x: raw.position?.x ?? 0, y: raw.position?.y ?? 0 },
				scale: { x: raw.xScale ?? 1, y: raw.yScale ?? 1 },
				rotation: raw.rotation ?? 0,
			} satisfies DxfInsertEntity;

		default:
			// Skip unsupported entity types
			return null;
	}
}

/** Extract numeric dimension value from dimension text */
function extractDimensionValue(text: string): number {
	if (!text) return 0;
	// Remove formatting, extract first number
	const cleaned = text.replace(/<[^>]*>/g, "").replace(/[^\d.,-]/g, "");
	const match = cleaned.match(/-?\d+\.?\d*/);
	return match ? Number.parseFloat(match[0]) : 0;
}

/** Normalize hatch boundary paths to Point2D arrays */
// biome-ignore lint/suspicious/noExplicitAny: dxf-parser boundary format varies
function normalizeBoundaryPaths(paths: any): { x: number; y: number }[][] {
	if (!paths || !Array.isArray(paths)) return [];
	return paths.map(
		// biome-ignore lint/suspicious/noExplicitAny: dxf-parser boundary format varies
		(path: any) => {
			if (Array.isArray(path)) {
				return path.map((p: { x: number; y: number }) => ({
					x: p.x ?? 0,
					y: p.y ?? 0,
				}));
			}
			if (path.edges) {
				// Edge-based boundary
				return path.edges.map((e: { start?: { x: number; y: number } }) => ({
					x: e.start?.x ?? 0,
					y: e.start?.y ?? 0,
				}));
			}
			return [];
		},
	);
}
