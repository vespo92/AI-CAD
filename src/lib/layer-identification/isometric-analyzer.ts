/**
 * Isometric Drawing Analyzer
 *
 * Detects isometric projections in 2D drawings and provides tools
 * to reverse-project entities back into 3D space.
 *
 * Isometric projection maps 3D → 2D via a specific transformation matrix.
 * By detecting the projection type and axis angles, we can invert this
 * to recover approximate 3D coordinates.
 *
 * Standard isometric: X/Y/Z axes appear at 30°/150°/270° from horizontal.
 */

import type { Point2D, Point3D } from "@/types/cad";
import type {
	ClassifiedLayer,
	DetectedView,
	DxfEntity,
	DxfLineEntity,
	ExtractedDimension,
	IsometricAnalysis,
	IsometricProjectionType,
	SymmetryAxis,
} from "./types";

// ─── Isometric Projection Matrices ────────────────────────────

// Standard isometric uses cos(30°) ≈ 0.866 and sin(30°) = 0.5 for axis projection

/**
 * Inverse isometric projection — maps 2D point + depth hint → 3D.
 *
 * A true isometric projection loses one dimension, so we need external
 * information (hidden lines, dimensions, or user hints) to fully resolve.
 * This function takes a depth estimate parameter.
 */
export function inverseIsometric(point2D: Point2D, depthEstimate = 0): Point3D {
	// Standard isometric: x2D = (x3D - z3D) * cos30, y2D = (x3D + z3D) * sin30 + y3D
	// With known depth (y3D = depthEstimate):
	const cos30 = Math.cos(Math.PI / 6);
	const sin30 = 0.5;

	// Solve system:
	// x2D = (x - z) * cos30
	// y2D = (x + z) * sin30 + y
	// y = depthEstimate
	const adjustedY = point2D.y - depthEstimate;
	const xPlusZ = adjustedY / sin30;
	const xMinusZ = point2D.x / cos30;

	const x3D = (xPlusZ + xMinusZ) / 2;
	const z3D = (xPlusZ - xMinusZ) / 2;

	return { x: x3D, y: depthEstimate, z: z3D };
}

/**
 * Forward isometric projection — maps 3D point → 2D.
 * Useful for validation: project reconstructed 3D back to 2D and compare.
 */
export function forwardIsometric(point3D: Point3D): Point2D {
	const cos30 = Math.cos(Math.PI / 6);
	const sin30 = 0.5;

	return {
		x: (point3D.x - point3D.z) * cos30,
		y: (point3D.x + point3D.z) * sin30 + point3D.y,
	};
}

// ─── Drawing Analysis ──────────────────────────────────────────

/**
 * Analyze a set of classified layers to detect isometric projection
 * and extract 3D reconstruction data.
 */
export function analyzeIsometricDrawing(
	layers: ClassifiedLayer[],
): IsometricAnalysis {
	const allEntities = layers.flatMap((l) => l.entities);
	const geometricEntities = allEntities.filter((e) =>
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

	// Detect projection type
	const projectionType = detectProjectionType(geometricEntities);

	// Detect separate views (for multi-view drawings)
	const views = detectViews(layers);

	// Extract dimensions
	const dimensions = extractDimensions(layers);

	// Find symmetry axes from centerlines
	const centerlineLayers = layers.filter(
		(l) => l.classification === "centerlines",
	);
	const symmetryAxes = detectSymmetryAxes(centerlineLayers);

	const confidence =
		projectionType === "isometric-30"
			? "high"
			: projectionType === "dimetric" || projectionType === "trimetric"
				? "medium"
				: "low";

	return {
		projectionType,
		views,
		dimensions,
		symmetryAxes,
		confidence,
	};
}

/**
 * Detect the isometric projection type by analyzing line angles.
 * Standard isometric has dominant angles at 30°, 150°, and 90°.
 */
function detectProjectionType(entities: DxfEntity[]): IsometricProjectionType {
	const lines = entities.filter((e): e is DxfLineEntity => e.type === "line");
	if (lines.length < 3) return "isometric-30"; // default assumption

	// Build angle histogram
	const angles: number[] = [];
	for (const line of lines) {
		const dx = line.end.x - line.start.x;
		const dy = line.end.y - line.start.y;
		if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) continue;

		let angle = (Math.atan2(dy, dx) * 180) / Math.PI;
		// Normalize to 0-180 range (direction-independent)
		if (angle < 0) angle += 180;
		angles.push(angle);
	}

	// Bucket angles into 5° bins
	const bins = new Map<number, number>();
	for (const angle of angles) {
		const bin = Math.round(angle / 5) * 5;
		bins.set(bin, (bins.get(bin) ?? 0) + 1);
	}

	// Find the top 3 angle clusters
	const sortedBins = Array.from(bins.entries()).sort((a, b) => b[1] - a[1]);
	const topAngles = sortedBins.slice(0, 4).map(([angle]) => angle);

	// Check for standard isometric pattern (30°, 90°, 150° or equivalents)
	const has30 = topAngles.some(
		(a) => Math.abs(a - 30) <= 5 || Math.abs(a - 150) <= 5,
	);
	const has90 = topAngles.some((a) => Math.abs(a - 90) <= 5);
	const has0 = topAngles.some((a) => a <= 5 || Math.abs(a - 180) <= 5);

	if (has30 && (has90 || has0)) {
		return "isometric-30";
	}

	// Check for cabinet/cavalier (45° dominant)
	const has45 = topAngles.some(
		(a) => Math.abs(a - 45) <= 5 || Math.abs(a - 135) <= 5,
	);
	if (has45 && has0) {
		return "cabinet";
	}

	// Check if two pairs of angles are equal (dimetric)
	if (topAngles.length >= 2) {
		const diff01 = Math.abs(topAngles[0] - topAngles[1]);
		if (Math.abs(diff01 - 60) <= 10) {
			return "dimetric";
		}
	}

	return "isometric-30"; // default
}

/**
 * Detect separate views in a multi-view drawing by finding
 * spatial clusters of entities.
 */
function detectViews(layers: ClassifiedLayer[]): DetectedView[] {
	const geometricLayers = layers.filter(
		(l) =>
			l.classification === "visible-outline" ||
			l.classification === "hidden-lines" ||
			l.classification === "unknown",
	);

	const allEntities = geometricLayers.flatMap((l) => l.entities);
	if (allEntities.length === 0) return [];

	// Compute bounding boxes per entity
	const entityBounds = allEntities
		.map((e) => ({ entity: e, bounds: getEntityBounds(e) }))
		.filter((eb) => eb.bounds !== null) as {
		entity: DxfEntity;
		bounds: { min: Point2D; max: Point2D };
	}[];

	if (entityBounds.length === 0) return [];

	// Simple clustering: find groups separated by large gaps
	const clusters = clusterEntities(entityBounds);

	return clusters.map((cluster) => {
		const bounds = mergeBounds(cluster.map((c) => c.bounds));
		const width = bounds.max.x - bounds.min.x;
		const height = bounds.max.y - bounds.min.y;

		// Heuristic view type detection based on position
		let viewType: DetectedView["viewType"] = "front";
		if (clusters.length > 1) {
			// In standard 3rd angle projection:
			// Front view is usually bottom-left, top view above, right view to the right
			const centerX = (bounds.min.x + bounds.max.x) / 2;
			const centerY = (bounds.min.y + bounds.max.y) / 2;

			const allBounds = mergeBounds(entityBounds.map((eb) => eb.bounds));
			const midX = (allBounds.min.x + allBounds.max.x) / 2;
			const midY = (allBounds.min.y + allBounds.max.y) / 2;

			if (centerY > midY && Math.abs(centerX - midX) < width) {
				viewType = "top";
			} else if (centerX > midX && Math.abs(centerY - midY) < height) {
				viewType = "right";
			} else if (centerX < midX && centerY < midY) {
				viewType = "front";
			}
		} else {
			// Single view — check if it looks isometric
			viewType = detectSingleViewType(cluster.map((c) => c.entity));
		}

		return {
			viewType,
			bounds,
			entities: cluster.map((c) => c.entity),
		};
	});
}

function detectSingleViewType(entities: DxfEntity[]): DetectedView["viewType"] {
	const lines = entities.filter((e): e is DxfLineEntity => e.type === "line");

	// Check for isometric angles (30° lines)
	let iso30Count = 0;
	let totalLines = 0;

	for (const line of lines) {
		const dx = line.end.x - line.start.x;
		const dy = line.end.y - line.start.y;
		const len = Math.sqrt(dx * dx + dy * dy);
		if (len < 0.01) continue;

		totalLines++;
		let angle = Math.abs((Math.atan2(dy, dx) * 180) / Math.PI);
		if (angle > 90) angle = 180 - angle;

		if (Math.abs(angle - 30) < 5 || Math.abs(angle - 60) < 5) {
			iso30Count++;
		}
	}

	// If > 30% of lines are at isometric angles, it's likely isometric
	if (totalLines > 0 && iso30Count / totalLines > 0.3) {
		return "isometric";
	}

	return "front";
}

/**
 * Extract dimension values and map them to directions.
 */
function extractDimensions(layers: ClassifiedLayer[]): ExtractedDimension[] {
	const dimLayers = layers.filter((l) => l.classification === "dimensions");

	const dimensions: ExtractedDimension[] = [];
	for (const layer of dimLayers) {
		for (const entity of layer.entities) {
			if (entity.type === "dimension" && entity.value > 0) {
				// Determine dimension direction from definition point and text midpoint
				const dx = entity.textMidpoint.x - entity.definitionPoint.x;
				const dy = entity.textMidpoint.y - entity.definitionPoint.y;
				const isHorizontal = Math.abs(dx) > Math.abs(dy);

				dimensions.push({
					value: entity.value,
					unit: "mm", // default, could parse from text
					entityRefs: [],
					direction: isHorizontal ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 },
				});
			}
		}
	}

	return dimensions;
}

/**
 * Detect symmetry axes from centerline layers.
 */
function detectSymmetryAxes(
	centerlineLayers: ClassifiedLayer[],
): SymmetryAxis[] {
	const axes: SymmetryAxis[] = [];

	for (const layer of centerlineLayers) {
		for (const entity of layer.entities) {
			if (entity.type !== "line") continue;

			const dx = entity.end.x - entity.start.x;
			const dy = entity.end.y - entity.start.y;
			let angle = (Math.atan2(dy, dx) * 180) / Math.PI;
			if (angle < 0) angle += 180;

			// Map centerline angle to 3D axis
			let mappedAxis: "X" | "Y" | "Z" = "X";
			if (Math.abs(angle) < 10 || Math.abs(angle - 180) < 10) {
				mappedAxis = "X";
			} else if (Math.abs(angle - 90) < 10) {
				mappedAxis = "Z"; // vertical in isometric
			} else if (Math.abs(angle - 30) < 10 || Math.abs(angle - 150) < 10) {
				mappedAxis = "Y";
			}

			axes.push({
				start: entity.start,
				end: entity.end,
				mappedAxis,
			});
		}
	}

	return axes;
}

// ─── Geometry Utilities ────────────────────────────────────────

function getEntityBounds(
	entity: DxfEntity,
): { min: Point2D; max: Point2D } | null {
	switch (entity.type) {
		case "line":
			return {
				min: {
					x: Math.min(entity.start.x, entity.end.x),
					y: Math.min(entity.start.y, entity.end.y),
				},
				max: {
					x: Math.max(entity.start.x, entity.end.x),
					y: Math.max(entity.start.y, entity.end.y),
				},
			};
		case "circle":
			return {
				min: {
					x: entity.center.x - entity.radius,
					y: entity.center.y - entity.radius,
				},
				max: {
					x: entity.center.x + entity.radius,
					y: entity.center.y + entity.radius,
				},
			};
		case "arc":
			// Simplified — use circle bounds (over-estimates)
			return {
				min: {
					x: entity.center.x - entity.radius,
					y: entity.center.y - entity.radius,
				},
				max: {
					x: entity.center.x + entity.radius,
					y: entity.center.y + entity.radius,
				},
			};
		case "polyline":
		case "lwpolyline": {
			if (entity.vertices.length === 0) return null;
			const xs = entity.vertices.map((v) => v.x);
			const ys = entity.vertices.map((v) => v.y);
			return {
				min: { x: Math.min(...xs), y: Math.min(...ys) },
				max: { x: Math.max(...xs), y: Math.max(...ys) },
			};
		}
		case "text":
		case "mtext":
			// Rough bounds based on position and text height
			return {
				min: { x: entity.position.x, y: entity.position.y },
				max: {
					x: entity.position.x + entity.text.length * entity.height * 0.6,
					y: entity.position.y + entity.height,
				},
			};
		default:
			return null;
	}
}

function mergeBounds(bounds: { min: Point2D; max: Point2D }[]): {
	min: Point2D;
	max: Point2D;
} {
	return {
		min: {
			x: Math.min(...bounds.map((b) => b.min.x)),
			y: Math.min(...bounds.map((b) => b.min.y)),
		},
		max: {
			x: Math.max(...bounds.map((b) => b.max.x)),
			y: Math.max(...bounds.map((b) => b.max.y)),
		},
	};
}

/**
 * Cluster entities by spatial proximity.
 * Uses a simple gap-based approach: entities separated by more than
 * the gap threshold are in different clusters.
 */
function clusterEntities(
	entityBounds: { entity: DxfEntity; bounds: { min: Point2D; max: Point2D } }[],
): { entity: DxfEntity; bounds: { min: Point2D; max: Point2D } }[][] {
	if (entityBounds.length === 0) return [];

	// Sort by X position
	const sorted = [...entityBounds].sort(
		(a, b) => a.bounds.min.x - b.bounds.min.x,
	);

	// Compute overall drawing extents
	const totalBounds = mergeBounds(sorted.map((s) => s.bounds));
	const drawingWidth = totalBounds.max.x - totalBounds.min.x;

	// Gap threshold: views are typically separated by > 10% of drawing width
	const gapThreshold = drawingWidth * 0.1;

	const clusters: (typeof sorted)[] = [[]];
	let currentCluster = clusters[0];
	let lastMaxX = sorted[0].bounds.max.x;

	for (const item of sorted) {
		if (
			item.bounds.min.x - lastMaxX > gapThreshold &&
			currentCluster.length > 0
		) {
			currentCluster = [];
			clusters.push(currentCluster);
		}
		currentCluster.push(item);
		lastMaxX = Math.max(lastMaxX, item.bounds.max.x);
	}

	return clusters.filter((c) => c.length > 0);
}
