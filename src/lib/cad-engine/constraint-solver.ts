/**
 * Geometric Constraint Solver
 *
 * A lightweight 2D constraint solver for the sketch editor.
 * Supports common geometric constraints: horizontal, vertical,
 * fixed, distance, equal, parallel, perpendicular, coincident.
 *
 * Uses iterative relaxation — not a full planegcs solver, but sufficient
 * for interactive sketching with visual feedback.
 */

import type { Constraint, Point2D, SketchEntity } from "@/types/cad";

interface SolverResult {
	entities: SketchEntity[];
	satisfied: boolean;
	unsatisfied: string[];
}

const MAX_ITERATIONS = 50;
const TOLERANCE = 0.01;

/**
 * Solve all constraints and return updated entity positions.
 */
export function solveConstraints(
	entities: SketchEntity[],
	constraints: Constraint[],
): SolverResult {
	// Deep clone entities so we don't mutate originals
	let working = entities.map((e) => ({
		...e,
		params: { ...e.params },
	}));

	const unsatisfied: string[] = [];

	for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
		let allSatisfied = true;

		for (const constraint of constraints) {
			const result = applyConstraint(working, constraint);
			if (!result.satisfied) {
				allSatisfied = false;
			}
			working = result.entities;
		}

		if (allSatisfied) {
			return { entities: working, satisfied: true, unsatisfied: [] };
		}
	}

	// Check which constraints are still unsatisfied
	for (const constraint of constraints) {
		if (!checkConstraint(working, constraint)) {
			unsatisfied.push(constraint.id);
		}
	}

	return {
		entities: working,
		satisfied: unsatisfied.length === 0,
		unsatisfied,
	};
}

function getEntity(
	entities: SketchEntity[],
	id: string,
): SketchEntity | undefined {
	return entities.find((e) => e.id === id);
}

function applyConstraint(
	entities: SketchEntity[],
	constraint: Constraint,
): { entities: SketchEntity[]; satisfied: boolean } {
	switch (constraint.type) {
		case "horizontal":
			return applyHorizontal(entities, constraint);
		case "vertical":
			return applyVertical(entities, constraint);
		case "coincident":
			return applyCoincident(entities, constraint);
		case "distance":
			return applyDistance(entities, constraint);
		case "equal":
			return applyEqual(entities, constraint);
		case "perpendicular":
			return applyPerpendicular(entities, constraint);
		case "parallel":
			return applyParallel(entities, constraint);
		default:
			return { entities, satisfied: true };
	}
}

function checkConstraint(
	entities: SketchEntity[],
	constraint: Constraint,
): boolean {
	const result = applyConstraint(
		entities.map((e) => ({ ...e, params: { ...e.params } })),
		constraint,
	);
	return result.satisfied;
}

/**
 * Horizontal: force a line's start and end to have the same Y.
 */
function applyHorizontal(
	entities: SketchEntity[],
	constraint: Constraint,
): { entities: SketchEntity[]; satisfied: boolean } {
	const entity = getEntity(entities, constraint.entities[0]);
	if (!entity || entity.type !== "line") return { entities, satisfied: true };

	const start = entity.params.start as Point2D;
	const end = entity.params.end as Point2D;
	const midY = (start.y + end.y) / 2;
	const diff = Math.abs(start.y - end.y);

	if (diff < TOLERANCE) return { entities, satisfied: true };

	entity.params.start = { ...start, y: midY };
	entity.params.end = { ...end, y: midY };
	return { entities, satisfied: false };
}

/**
 * Vertical: force a line's start and end to have the same X.
 */
function applyVertical(
	entities: SketchEntity[],
	constraint: Constraint,
): { entities: SketchEntity[]; satisfied: boolean } {
	const entity = getEntity(entities, constraint.entities[0]);
	if (!entity || entity.type !== "line") return { entities, satisfied: true };

	const start = entity.params.start as Point2D;
	const end = entity.params.end as Point2D;
	const midX = (start.x + end.x) / 2;
	const diff = Math.abs(start.x - end.x);

	if (diff < TOLERANCE) return { entities, satisfied: true };

	entity.params.start = { ...start, x: midX };
	entity.params.end = { ...end, x: midX };
	return { entities, satisfied: false };
}

/**
 * Coincident: two points share the same location.
 * entities[0] = first entity, entities[1] = second entity
 * The solver uses end-point of first and start-point of second.
 */
function applyCoincident(
	entities: SketchEntity[],
	constraint: Constraint,
): { entities: SketchEntity[]; satisfied: boolean } {
	if (constraint.entities.length < 2) return { entities, satisfied: true };

	const e1 = getEntity(entities, constraint.entities[0]);
	const e2 = getEntity(entities, constraint.entities[1]);
	if (!e1 || !e2) return { entities, satisfied: true };

	const p1 = getEndPoint(e1);
	const p2 = getStartPoint(e2);
	if (!p1 || !p2) return { entities, satisfied: true };

	const dx = p2.x - p1.x;
	const dy = p2.y - p1.y;
	const dist = Math.sqrt(dx * dx + dy * dy);

	if (dist < TOLERANCE) return { entities, satisfied: true };

	// Move both toward midpoint
	const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
	setEndPoint(e1, mid);
	setStartPoint(e2, mid);

	return { entities, satisfied: false };
}

/**
 * Distance: enforce a specific distance between two points.
 */
function applyDistance(
	entities: SketchEntity[],
	constraint: Constraint,
): { entities: SketchEntity[]; satisfied: boolean } {
	const entity = getEntity(entities, constraint.entities[0]);
	if (!entity) return { entities, satisfied: true };

	const targetDist = constraint.value ?? 0;

	if (entity.type === "line") {
		const start = entity.params.start as Point2D;
		const end = entity.params.end as Point2D;
		const dx = end.x - start.x;
		const dy = end.y - start.y;
		const currentDist = Math.sqrt(dx * dx + dy * dy);

		if (Math.abs(currentDist - targetDist) < TOLERANCE) {
			return { entities, satisfied: true };
		}

		if (currentDist < TOLERANCE) return { entities, satisfied: false };

		// Scale from midpoint
		const mid = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
		const scale = targetDist / currentDist;
		entity.params.start = {
			x: mid.x + (start.x - mid.x) * scale,
			y: mid.y + (start.y - mid.y) * scale,
		};
		entity.params.end = {
			x: mid.x + (end.x - mid.x) * scale,
			y: mid.y + (end.y - mid.y) * scale,
		};
		return { entities, satisfied: false };
	}

	if (entity.type === "circle") {
		const currentRadius = entity.params.radius as number;
		if (Math.abs(currentRadius - targetDist) < TOLERANCE) {
			return { entities, satisfied: true };
		}
		entity.params.radius = targetDist;
		return { entities, satisfied: false };
	}

	return { entities, satisfied: true };
}

/**
 * Equal: two lines have the same length, or two circles same radius.
 */
function applyEqual(
	entities: SketchEntity[],
	constraint: Constraint,
): { entities: SketchEntity[]; satisfied: boolean } {
	if (constraint.entities.length < 2) return { entities, satisfied: true };

	const e1 = getEntity(entities, constraint.entities[0]);
	const e2 = getEntity(entities, constraint.entities[1]);
	if (!e1 || !e2) return { entities, satisfied: true };

	if (e1.type === "line" && e2.type === "line") {
		const len1 = lineLength(e1);
		const len2 = lineLength(e2);
		const avg = (len1 + len2) / 2;

		if (Math.abs(len1 - len2) < TOLERANCE) {
			return { entities, satisfied: true };
		}

		scaleLine(e1, avg);
		scaleLine(e2, avg);
		return { entities, satisfied: false };
	}

	if (e1.type === "circle" && e2.type === "circle") {
		const r1 = e1.params.radius as number;
		const r2 = e2.params.radius as number;
		const avg = (r1 + r2) / 2;

		if (Math.abs(r1 - r2) < TOLERANCE) {
			return { entities, satisfied: true };
		}

		e1.params.radius = avg;
		e2.params.radius = avg;
		return { entities, satisfied: false };
	}

	return { entities, satisfied: true };
}

/**
 * Perpendicular: two lines are at 90 degrees.
 */
function applyPerpendicular(
	entities: SketchEntity[],
	constraint: Constraint,
): { entities: SketchEntity[]; satisfied: boolean } {
	if (constraint.entities.length < 2) return { entities, satisfied: true };

	const e1 = getEntity(entities, constraint.entities[0]);
	const e2 = getEntity(entities, constraint.entities[1]);
	if (!e1 || !e2 || e1.type !== "line" || e2.type !== "line") {
		return { entities, satisfied: true };
	}

	const d1 = lineDirection(e1);
	const d2 = lineDirection(e2);
	const dot = d1.x * d2.x + d1.y * d2.y;

	if (Math.abs(dot) < TOLERANCE) return { entities, satisfied: true };

	// Rotate e2 to be perpendicular to e1
	const perpDir = { x: -d1.y, y: d1.x };
	const len2 = lineLength(e2);
	const start2 = e2.params.start as Point2D;

	e2.params.end = {
		x: start2.x + perpDir.x * len2,
		y: start2.y + perpDir.y * len2,
	};
	return { entities, satisfied: false };
}

/**
 * Parallel: two lines have the same direction.
 */
function applyParallel(
	entities: SketchEntity[],
	constraint: Constraint,
): { entities: SketchEntity[]; satisfied: boolean } {
	if (constraint.entities.length < 2) return { entities, satisfied: true };

	const e1 = getEntity(entities, constraint.entities[0]);
	const e2 = getEntity(entities, constraint.entities[1]);
	if (!e1 || !e2 || e1.type !== "line" || e2.type !== "line") {
		return { entities, satisfied: true };
	}

	const d1 = lineDirection(e1);
	const d2 = lineDirection(e2);
	const cross = d1.x * d2.y - d1.y * d2.x;

	if (Math.abs(cross) < TOLERANCE) return { entities, satisfied: true };

	// Rotate e2 to be parallel to e1
	const len2 = lineLength(e2);
	const start2 = e2.params.start as Point2D;
	const sign = d1.x * d2.x + d1.y * d2.y >= 0 ? 1 : -1;

	e2.params.end = {
		x: start2.x + d1.x * len2 * sign,
		y: start2.y + d1.y * len2 * sign,
	};
	return { entities, satisfied: false };
}

// ─── Helpers ─────────────────────────────────────────────────────

function getStartPoint(entity: SketchEntity): Point2D | null {
	if (entity.type === "line" || entity.type === "rectangle") {
		return entity.params.start as Point2D;
	}
	if (entity.type === "circle") {
		return entity.params.center as Point2D;
	}
	return null;
}

function getEndPoint(entity: SketchEntity): Point2D | null {
	if (entity.type === "line" || entity.type === "rectangle") {
		return entity.params.end as Point2D;
	}
	if (entity.type === "circle") {
		return entity.params.center as Point2D;
	}
	return null;
}

function setStartPoint(entity: SketchEntity, p: Point2D): void {
	if (entity.type === "line" || entity.type === "rectangle") {
		entity.params.start = p;
	} else if (entity.type === "circle") {
		entity.params.center = p;
	}
}

function setEndPoint(entity: SketchEntity, p: Point2D): void {
	if (entity.type === "line" || entity.type === "rectangle") {
		entity.params.end = p;
	} else if (entity.type === "circle") {
		entity.params.center = p;
	}
}

function lineLength(entity: SketchEntity): number {
	const start = entity.params.start as Point2D;
	const end = entity.params.end as Point2D;
	const dx = end.x - start.x;
	const dy = end.y - start.y;
	return Math.sqrt(dx * dx + dy * dy);
}

function lineDirection(entity: SketchEntity): Point2D {
	const start = entity.params.start as Point2D;
	const end = entity.params.end as Point2D;
	const dx = end.x - start.x;
	const dy = end.y - start.y;
	const len = Math.sqrt(dx * dx + dy * dy);
	if (len < TOLERANCE) return { x: 1, y: 0 };
	return { x: dx / len, y: dy / len };
}

function scaleLine(entity: SketchEntity, targetLen: number): void {
	const start = entity.params.start as Point2D;
	const end = entity.params.end as Point2D;
	const mid = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
	const dx = end.x - start.x;
	const dy = end.y - start.y;
	const len = Math.sqrt(dx * dx + dy * dy);
	if (len < TOLERANCE) return;
	const scale = targetLen / len;
	entity.params.start = {
		x: mid.x - (dx / 2) * scale,
		y: mid.y - (dy / 2) * scale,
	};
	entity.params.end = {
		x: mid.x + (dx / 2) * scale,
		y: mid.y + (dy / 2) * scale,
	};
}

/**
 * Auto-detect potential constraints for a newly drawn entity.
 * Returns suggested constraints based on geometry analysis.
 */
export function suggestConstraints(
	entity: SketchEntity,
	existingEntities: SketchEntity[],
): Constraint[] {
	const suggestions: Constraint[] = [];

	if (entity.type === "line") {
		const start = entity.params.start as Point2D;
		const end = entity.params.end as Point2D;
		const dx = Math.abs(end.x - start.x);
		const dy = Math.abs(end.y - start.y);

		// Near-horizontal
		if (dy < 3 && dx > 5) {
			suggestions.push({
				id: crypto.randomUUID(),
				type: "horizontal",
				entities: [entity.id],
			});
		}

		// Near-vertical
		if (dx < 3 && dy > 5) {
			suggestions.push({
				id: crypto.randomUUID(),
				type: "vertical",
				entities: [entity.id],
			});
		}

		// Coincident with existing entity endpoints
		for (const existing of existingEntities) {
			if (existing.id === entity.id) continue;
			const existingEnd = getEndPoint(existing);
			if (existingEnd) {
				const distToStart = Math.sqrt(
					(existingEnd.x - start.x) ** 2 + (existingEnd.y - start.y) ** 2,
				);
				if (distToStart < 5) {
					suggestions.push({
						id: crypto.randomUUID(),
						type: "coincident",
						entities: [existing.id, entity.id],
					});
				}
			}
		}
	}

	return suggestions;
}
