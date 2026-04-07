/**
 * Profile Extractor
 *
 * Extracts closed 2D profiles from classified layers.
 * These profiles become the input for 3D reconstruction —
 * each profile can be extruded, revolved, lofted, etc.
 *
 * The key insight: visible-outline layers contain the outer contours,
 * hidden-lines reveal internal geometry (holes, pockets, through-features),
 * and centerlines indicate axes of revolution.
 */

import type { Point2D } from "@/types/cad";
import type {
	ClassifiedLayer,
	DxfArcEntity,
	DxfCircleEntity,
	DxfEntity,
	DxfLineEntity,
	DxfPolylineEntity,
	ExtractedProfile,
} from "./types";

const TOLERANCE = 0.01; // Point coincidence tolerance

/**
 * Extract closed profiles from classified layers.
 * Returns profiles suitable for extrusion or revolution.
 */
export function extractProfiles(layers: ClassifiedLayer[]): ExtractedProfile[] {
	const profiles: ExtractedProfile[] = [];

	// Extract from visible outline layers (main body profiles)
	const outlineLayers = layers.filter(
		(l) => l.classification === "visible-outline",
	);
	for (const layer of outlineLayers) {
		const found = extractClosedProfiles(layer.entities, "visible-outline");
		profiles.push(...found);
	}

	// Extract from hidden line layers (internal features / holes)
	const hiddenLayers = layers.filter(
		(l) => l.classification === "hidden-lines",
	);
	for (const layer of hiddenLayers) {
		const found = extractClosedProfiles(layer.entities, "hidden-lines");
		profiles.push(...found);
	}

	// Label profiles meaningfully
	let outlineIdx = 1;
	let holeIdx = 1;
	for (const profile of profiles) {
		if (profile.sourceClassification === "visible-outline") {
			profile.label = `Outline ${outlineIdx++}`;
		} else {
			profile.label = `Hidden Feature ${holeIdx++}`;
		}
	}

	return profiles;
}

/**
 * Find closed loops (profiles) from a set of 2D entities.
 *
 * Strategy:
 * 1. Collect all closed polylines directly (they're already profiles)
 * 2. Collect circles as profiles
 * 3. Try to chain loose lines/arcs into closed loops
 */
function extractClosedProfiles(
	entities: DxfEntity[],
	sourceClassification: ExtractedProfile["sourceClassification"],
): ExtractedProfile[] {
	const profiles: ExtractedProfile[] = [];

	// 1. Closed polylines → profiles directly
	const closedPolys = entities.filter(
		(e): e is DxfPolylineEntity =>
			(e.type === "polyline" || e.type === "lwpolyline") && e.closed,
	);
	for (const poly of closedPolys) {
		if (poly.vertices.length < 3) continue;
		profiles.push({
			id: crypto.randomUUID(),
			label: "",
			contour: [...poly.vertices],
			holes: [],
			plane: "XY",
			planeOffset: 0,
			sourceClassification,
		});
	}

	// 2. Circles → profiles
	const circles = entities.filter(
		(e): e is DxfCircleEntity => e.type === "circle",
	);
	for (const circle of circles) {
		const points = discretizeCircle(circle.center, circle.radius, 32);
		profiles.push({
			id: crypto.randomUUID(),
			label: "",
			contour: points,
			holes: [],
			plane: "XY",
			planeOffset: 0,
			sourceClassification,
		});
	}

	// 3. Chain loose lines and arcs into closed loops
	const lines = entities.filter((e): e is DxfLineEntity => e.type === "line");
	const arcs = entities.filter((e): e is DxfArcEntity => e.type === "arc");

	// Convert lines and arcs to edge segments
	const edges: Edge[] = [];
	for (const line of lines) {
		edges.push({
			start: line.start,
			end: line.end,
			points: [line.start, line.end],
		});
	}
	for (const arc of arcs) {
		const points = discretizeArc(
			arc.center,
			arc.radius,
			arc.startAngle,
			arc.endAngle,
			16,
		);
		if (points.length >= 2) {
			edges.push({
				start: points[0],
				end: points[points.length - 1],
				points,
			});
		}
	}

	// Find closed chains
	const chains = findClosedChains(edges);
	for (const chain of chains) {
		if (chain.length < 3) continue;
		profiles.push({
			id: crypto.randomUUID(),
			label: "",
			contour: chain,
			holes: [],
			plane: "XY",
			planeOffset: 0,
			sourceClassification,
		});
	}

	// Post-process: detect holes (small profiles contained within larger ones)
	assignHolesToProfiles(profiles);

	return profiles;
}

// ─── Edge Chaining ─────────────────────────────────────────────

interface Edge {
	start: Point2D;
	end: Point2D;
	points: Point2D[];
}

/**
 * Find closed chains by connecting edges endpoint-to-endpoint.
 * Uses a greedy approach: start from an unused edge, keep extending
 * until we either close the loop or run out of connections.
 */
function findClosedChains(edges: Edge[]): Point2D[][] {
	const chains: Point2D[][] = [];
	const used = new Set<number>();

	for (let startIdx = 0; startIdx < edges.length; startIdx++) {
		if (used.has(startIdx)) continue;

		const chain: Point2D[] = [];
		let currentEnd = edges[startIdx].end;

		used.add(startIdx);
		chain.push(...edges[startIdx].points);

		let found = true;
		while (found) {
			found = false;

			// Check if we've closed the loop
			if (chain.length >= 3 && pointsClose(currentEnd, edges[startIdx].start)) {
				chains.push(chain);
				break;
			}

			// Find next connected edge
			for (let i = 0; i < edges.length; i++) {
				if (used.has(i)) continue;

				if (pointsClose(currentEnd, edges[i].start)) {
					used.add(i);
					// Skip first point (it's the connection point)
					chain.push(...edges[i].points.slice(1));
					currentEnd = edges[i].end;
					found = true;
					break;
				}
				if (pointsClose(currentEnd, edges[i].end)) {
					// Reverse this edge
					used.add(i);
					const reversed = [...edges[i].points].reverse();
					chain.push(...reversed.slice(1));
					currentEnd = edges[i].start;
					found = true;
					break;
				}
			}
		}
	}

	return chains;
}

function pointsClose(a: Point2D, b: Point2D): boolean {
	const dx = a.x - b.x;
	const dy = a.y - b.y;
	return dx * dx + dy * dy < TOLERANCE * TOLERANCE;
}

// ─── Hole Detection ────────────────────────────────────────────

/**
 * Detect which profiles are holes inside larger profiles.
 * A profile is a hole if it's entirely contained within another profile.
 */
function assignHolesToProfiles(profiles: ExtractedProfile[]): void {
	// Sort by area (largest first)
	const withArea = profiles.map((p) => ({
		profile: p,
		area: computeArea(p.contour),
		bounds: computeBounds(p.contour),
	}));
	withArea.sort((a, b) => Math.abs(b.area) - Math.abs(a.area));

	const holeIndices = new Set<number>();

	for (let i = 0; i < withArea.length; i++) {
		if (holeIndices.has(i)) continue;

		for (let j = i + 1; j < withArea.length; j++) {
			if (holeIndices.has(j)) continue;

			const outer = withArea[i];
			const inner = withArea[j];

			// Quick bounds check
			if (
				inner.bounds.min.x >= outer.bounds.min.x &&
				inner.bounds.max.x <= outer.bounds.max.x &&
				inner.bounds.min.y >= outer.bounds.min.y &&
				inner.bounds.max.y <= outer.bounds.max.y
			) {
				// Check if centroid of inner is inside outer
				const centroid = computeCentroid(inner.profile.contour);
				if (pointInPolygon(centroid, outer.profile.contour)) {
					outer.profile.holes.push(inner.profile.contour);
					holeIndices.add(j);
				}
			}
		}
	}

	// Remove hole profiles from the main list (they're now nested)
	const indicesToRemove = Array.from(holeIndices).sort((a, b) => b - a);
	for (const idx of indicesToRemove) {
		profiles.splice(idx, 1);
	}
}

// ─── Geometry Helpers ──────────────────────────────────────────

function discretizeCircle(
	center: Point2D,
	radius: number,
	segments: number,
): Point2D[] {
	const points: Point2D[] = [];
	for (let i = 0; i < segments; i++) {
		const angle = (i / segments) * Math.PI * 2;
		points.push({
			x: center.x + radius * Math.cos(angle),
			y: center.y + radius * Math.sin(angle),
		});
	}
	return points;
}

function discretizeArc(
	center: Point2D,
	radius: number,
	startAngleDeg: number,
	endAngleDeg: number,
	segments: number,
): Point2D[] {
	const startRad = (startAngleDeg * Math.PI) / 180;
	let endRad = (endAngleDeg * Math.PI) / 180;
	if (endRad <= startRad) endRad += Math.PI * 2;

	const points: Point2D[] = [];
	for (let i = 0; i <= segments; i++) {
		const t = i / segments;
		const angle = startRad + t * (endRad - startRad);
		points.push({
			x: center.x + radius * Math.cos(angle),
			y: center.y + radius * Math.sin(angle),
		});
	}
	return points;
}

/** Compute signed area of a polygon (positive = CCW) */
function computeArea(points: Point2D[]): number {
	let area = 0;
	for (let i = 0; i < points.length; i++) {
		const j = (i + 1) % points.length;
		area += points[i].x * points[j].y;
		area -= points[j].x * points[i].y;
	}
	return area / 2;
}

function computeBounds(points: Point2D[]): { min: Point2D; max: Point2D } {
	const xs = points.map((p) => p.x);
	const ys = points.map((p) => p.y);
	return {
		min: { x: Math.min(...xs), y: Math.min(...ys) },
		max: { x: Math.max(...xs), y: Math.max(...ys) },
	};
}

function computeCentroid(points: Point2D[]): Point2D {
	const n = points.length;
	return {
		x: points.reduce((sum, p) => sum + p.x, 0) / n,
		y: points.reduce((sum, p) => sum + p.y, 0) / n,
	};
}

/** Ray-casting point-in-polygon test */
function pointInPolygon(point: Point2D, polygon: Point2D[]): boolean {
	let inside = false;
	for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
		const xi = polygon[i].x;
		const yi = polygon[i].y;
		const xj = polygon[j].x;
		const yj = polygon[j].y;

		const intersect =
			yi > point.y !== yj > point.y &&
			point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi;
		if (intersect) inside = !inside;
	}
	return inside;
}
