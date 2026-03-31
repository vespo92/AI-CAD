/**
 * Splicer Engine
 *
 * Handles connecting parts at connection points, computing transforms,
 * and generating combined Replicad code for spliced assemblies.
 */

import type { Point3D } from "@/types/cad";
import type {
	ConnectionPoint,
	ExtrusionProfile,
	SpliceAssembly,
	SpliceJoint,
	SplicerDefinition,
} from "@/types/splicer";

// ─── Connection Compatibility ──────────────────────────────────

/**
 * Check if two connection points are compatible for splicing.
 */
export function areConnectionsCompatible(
	a: ConnectionPoint,
	b: ConnectionPoint,
): boolean {
	// Gender check: male-female or neutral-anything
	const genderOk =
		(a.gender === "male" && b.gender === "female") ||
		(a.gender === "female" && b.gender === "male") ||
		a.gender === "neutral" ||
		b.gender === "neutral";

	if (!genderOk) return false;

	// Size check: diameters must be within 10% tolerance
	const sizeTolerance = 0.1;
	const sizeRatio =
		Math.abs(a.diameter - b.diameter) / Math.max(a.diameter, b.diameter);
	if (sizeRatio > sizeTolerance) return false;

	// Tag check: at least one common compatibility tag
	const commonTags = a.compatTags.filter((t) => b.compatTags.includes(t));
	return commonTags.length > 0;
}

/**
 * Find all compatible connections between two splicer definitions.
 */
export function findCompatibleConnections(
	source: SplicerDefinition,
	target: SplicerDefinition,
): Array<{ source: ConnectionPoint; target: ConnectionPoint; score: number }> {
	const matches: Array<{
		source: ConnectionPoint;
		target: ConnectionPoint;
		score: number;
	}> = [];

	for (const sc of source.connections) {
		for (const tc of target.connections) {
			if (areConnectionsCompatible(sc, tc)) {
				// Score based on number of matching tags and size similarity
				const commonTags = sc.compatTags.filter((t) =>
					tc.compatTags.includes(t),
				);
				const sizeMatch =
					1 -
					Math.abs(sc.diameter - tc.diameter) /
						Math.max(sc.diameter, tc.diameter);
				const score = commonTags.length * 10 + sizeMatch * 5;
				matches.push({ source: sc, target: tc, score });
			}
		}
	}

	return matches.sort((a, b) => b.score - a.score);
}

// ─── Transform Computation ─────────────────────────────────────

interface Transform3D {
	translation: Point3D;
	/** Rotation angles in degrees (Euler XYZ) */
	rotation: Point3D;
}

/**
 * Compute the transform needed to align a target connection point
 * to a source connection point (face-to-face, normals opposing).
 */
export function computeSpliceTransform(
	sourceConn: ConnectionPoint,
	targetConn: ConnectionPoint,
	offset = 0,
): Transform3D {
	// The target normal should oppose the source normal
	// Translation = source.position - target.position + offset along source normal
	const translation: Point3D = {
		x:
			sourceConn.position.x -
			targetConn.position.x +
			sourceConn.normal.x * offset,
		y:
			sourceConn.position.y -
			targetConn.position.y +
			sourceConn.normal.y * offset,
		z:
			sourceConn.position.z -
			targetConn.position.z +
			sourceConn.normal.z * offset,
	};

	// Compute rotation to align target normal to -source normal
	const rotation = computeAlignmentRotation(targetConn.normal, {
		x: -sourceConn.normal.x,
		y: -sourceConn.normal.y,
		z: -sourceConn.normal.z,
	});

	return { translation, rotation };
}

function computeAlignmentRotation(from: Point3D, to: Point3D): Point3D {
	// Simplified Euler angle computation for aligning normals
	const dot = from.x * to.x + from.y * to.y + from.z * to.z;

	if (Math.abs(dot - 1) < 1e-6) {
		return { x: 0, y: 0, z: 0 }; // Already aligned
	}
	if (Math.abs(dot + 1) < 1e-6) {
		return { x: 180, y: 0, z: 0 }; // Opposite — rotate 180 around X
	}

	// Cross product for rotation axis
	const cross = {
		x: from.y * to.z - from.z * to.y,
		y: from.z * to.x - from.x * to.z,
		z: from.x * to.y - from.y * to.x,
	};
	const angle = Math.acos(Math.max(-1, Math.min(1, dot))) * (180 / Math.PI);

	// Decompose into Euler angles (approximate)
	const mag = Math.sqrt(cross.x ** 2 + cross.y ** 2 + cross.z ** 2);
	if (mag < 1e-6) return { x: 0, y: 0, z: 0 };

	return {
		x: (cross.x / mag) * angle,
		y: (cross.y / mag) * angle,
		z: (cross.z / mag) * angle,
	};
}

// ─── Code Generation ───────────────────────────────────────────

/**
 * Generate Replicad code for a single spliced joint between two parts.
 */
export function generateJointCode(
	joint: SpliceJoint,
	source: SplicerDefinition,
	target: SplicerDefinition,
): string {
	const sourceConn = source.connections.find(
		(c) => c.id === joint.sourceConnectionId,
	);
	const targetConn = target.connections.find(
		(c) => c.id === joint.targetConnectionId,
	);

	if (!sourceConn || !targetConn) {
		return `// ERROR: Connection points not found for joint ${joint.id}`;
	}

	const transform = computeSpliceTransform(
		sourceConn,
		targetConn,
		joint.offset,
	);
	const lines: string[] = [];

	// Generate source part
	lines.push(`// Source: ${source.partName}`);
	lines.push(`const source_${sanitize(source.id)} = (() => {`);
	lines.push(`  ${indentCode(source.code)}`);
	lines.push("})();");
	lines.push("");

	// Generate target part with transform
	lines.push(`// Target: ${target.partName} (aligned to ${sourceConn.name})`);
	lines.push(`const target_${sanitize(target.id)} = (() => {`);
	lines.push(`  ${indentCode(target.code)}`);
	lines.push("})()");

	// Apply rotation if needed
	const { rotation, translation } = transform;
	if (rotation.x !== 0 || rotation.y !== 0 || rotation.z !== 0) {
		lines.push(`  .rotate(${rotation.x.toFixed(2)}, [0, 0, 0], [1, 0, 0])`);
		if (rotation.y !== 0) {
			lines.push(`  .rotate(${rotation.y.toFixed(2)}, [0, 0, 0], [0, 1, 0])`);
		}
		if (rotation.z !== 0) {
			lines.push(`  .rotate(${rotation.z.toFixed(2)}, [0, 0, 0], [0, 0, 1])`);
		}
	}

	// Apply translation
	lines.push(
		`  .translate(${translation.x.toFixed(3)}, ${translation.y.toFixed(3)}, ${translation.z.toFixed(3)});`,
	);

	// Join
	if (joint.fuseGeometry) {
		lines.push("");
		lines.push(
			`const joint_${sanitize(joint.id)} = source_${sanitize(source.id)}.fuse(target_${sanitize(target.id)});`,
		);
	}

	return lines.join("\n");
}

/**
 * Generate complete Replicad code for an entire splice assembly.
 */
export function generateAssemblyCode(assembly: SpliceAssembly): string {
	const lines: string[] = [];
	lines.push(`// Splice Assembly: ${assembly.name}`);
	lines.push(`// Generated at ${new Date().toISOString()}`);
	lines.push("");

	const splicerMap = new Map(assembly.splicers.map((s) => [s.id, s]));

	// Generate each part as an IIFE
	for (const splicer of assembly.splicers) {
		lines.push(`// Part: ${splicer.partName}`);
		lines.push(`const part_${sanitize(splicer.id)} = (() => {`);
		lines.push(`  ${indentCode(splicer.code)}`);
		lines.push("})();");
		lines.push("");
	}

	// Apply transforms for each joint
	const transformed = new Set<string>();
	for (const joint of assembly.joints) {
		const source = splicerMap.get(joint.sourceSplicerId);
		const target = splicerMap.get(joint.targetSplicerId);
		if (!source || !target) continue;

		const sourceConn = source.connections.find(
			(c) => c.id === joint.sourceConnectionId,
		);
		const targetConn = target.connections.find(
			(c) => c.id === joint.targetConnectionId,
		);
		if (!sourceConn || !targetConn) continue;

		const transform = computeSpliceTransform(
			sourceConn,
			targetConn,
			joint.offset,
		);
		const targetVar = `part_${sanitize(target.id)}`;
		const alignedVar = `aligned_${sanitize(target.id)}`;

		lines.push(
			`// Align ${target.partName} → ${source.partName} (${sourceConn.name} ↔ ${targetConn.name})`,
		);

		let code = `const ${alignedVar} = ${targetVar}`;
		const { rotation, translation } = transform;

		if (rotation.x !== 0) {
			code += `\n  .rotate(${rotation.x.toFixed(2)}, [0, 0, 0], [1, 0, 0])`;
		}
		if (rotation.y !== 0) {
			code += `\n  .rotate(${rotation.y.toFixed(2)}, [0, 0, 0], [0, 1, 0])`;
		}
		if (rotation.z !== 0) {
			code += `\n  .rotate(${rotation.z.toFixed(2)}, [0, 0, 0], [0, 0, 1])`;
		}

		code += `\n  .translate(${translation.x.toFixed(3)}, ${translation.y.toFixed(3)}, ${translation.z.toFixed(3)});`;
		lines.push(code);
		lines.push("");
		transformed.add(target.id);
	}

	// Fuse all parts together
	const allParts = assembly.splicers.map((s) => {
		const varName = transformed.has(s.id)
			? `aligned_${sanitize(s.id)}`
			: `part_${sanitize(s.id)}`;
		return varName;
	});

	if (allParts.length === 1) {
		lines.push(`return ${allParts[0]};`);
	} else {
		const fuseJoints = assembly.joints.filter((j) => j.fuseGeometry);
		if (fuseJoints.length > 0) {
			lines.push("// Fuse all parts");
			lines.push(`let result = ${allParts[0]};`);
			for (let i = 1; i < allParts.length; i++) {
				lines.push(`result = result.fuse(${allParts[i]});`);
			}
			lines.push("return result;");
		} else {
			// Return as compound (not fused)
			lines.push("// Compound assembly (not fused)");
			lines.push(`return compoundShapes(${allParts.join(", ")});`);
		}
	}

	return lines.join("\n");
}

// ─── Extrusion with Splicer Points ────────────────────────────

/**
 * Generate Replicad code for an extrusion profile that includes
 * connection points at both ends.
 */
export function generateExtrusionWithConnections(profile: ExtrusionProfile): {
	code: string;
	connections: ConnectionPoint[];
} {
	const lines: string[] = [];
	lines.push(`// Extrusion: ${profile.name}`);

	// Build the sketch
	lines.push("const sketch = (() => {");
	lines.push(`  ${indentCode(profile.sketchCode)}`);
	lines.push("})();");

	// Apply extrusion based on type
	const height = profile.params.height || 20;

	switch (profile.extrusionType) {
		case "linear":
			lines.push(`const shape = sketch.extrude(${height});`);
			break;
		case "tapered": {
			const angle = profile.params.taperAngle || 5;
			lines.push(
				`const shape = sketch.extrude(${height}, { extrusionProfile: { profile: "linear", endFactor: ${1 - angle / 90} } });`,
			);
			break;
		}
		case "twisted": {
			const twist = profile.params.twistAngle || 45;
			lines.push(
				`const shape = sketch.extrude(${height}, { twistAngle: ${twist} });`,
			);
			break;
		}
		case "along-path": {
			if (profile.params.pathCode) {
				lines.push("const path = (() => {");
				lines.push(`  ${indentCode(profile.params.pathCode)}`);
				lines.push("})();");
				lines.push(
					"const shape = sketch.sweepSketch((plane, origin) => sketch);",
				);
			} else {
				lines.push(`const shape = sketch.extrude(${height});`);
			}
			break;
		}
	}

	lines.push("return shape;");

	// Auto-generate connection points at both ends
	const startConn: ConnectionPoint = {
		id: crypto.randomUUID(),
		name: `${profile.name}-start`,
		position: { x: 0, y: 0, z: 0 },
		normal: { x: 0, y: 0, z: -1 },
		up: { x: 0, y: 1, z: 0 },
		gender: "neutral",
		diameter: profile.endConnections.start.diameter,
		compatTags: profile.endConnections.start.compatTags,
	};

	const endConn: ConnectionPoint = {
		id: crypto.randomUUID(),
		name: `${profile.name}-end`,
		position: { x: 0, y: 0, z: height },
		normal: { x: 0, y: 0, z: 1 },
		up: { x: 0, y: 1, z: 0 },
		gender: "neutral",
		diameter: profile.endConnections.end.diameter,
		compatTags: profile.endConnections.end.compatTags,
	};

	return {
		code: lines.join("\n"),
		connections: [startConn, endConn],
	};
}

// ─── Connection Point Helpers ──────────────────────────────────

/**
 * Create a connection point from simple parameters.
 */
export function createConnectionPoint(
	name: string,
	position: Point3D,
	normal: Point3D,
	opts: {
		gender?: ConnectionPoint["gender"];
		diameter?: number;
		compatTags?: string[];
	} = {},
): ConnectionPoint {
	return {
		id: crypto.randomUUID(),
		name,
		position,
		normal,
		up: { x: 0, y: 1, z: 0 },
		gender: opts.gender || "neutral",
		diameter: opts.diameter || 10,
		compatTags: opts.compatTags || [],
	};
}

/**
 * Auto-detect potential connection points from a part's bounding box.
 * Creates points at each face center.
 */
export function autoDetectConnections(
	partName: string,
	bbox: { min: Point3D; max: Point3D },
	compatTags: string[] = [],
): ConnectionPoint[] {
	const cx = (bbox.min.x + bbox.max.x) / 2;
	const cy = (bbox.min.y + bbox.max.y) / 2;
	const cz = (bbox.min.z + bbox.max.z) / 2;
	const dx = bbox.max.x - bbox.min.x;
	const dy = bbox.max.y - bbox.min.y;
	const dz = bbox.max.z - bbox.min.z;

	return [
		createConnectionPoint(
			`${partName}-top`,
			{ x: cx, y: cy, z: bbox.max.z },
			{ x: 0, y: 0, z: 1 },
			{ diameter: Math.min(dx, dy), compatTags },
		),
		createConnectionPoint(
			`${partName}-bottom`,
			{ x: cx, y: cy, z: bbox.min.z },
			{ x: 0, y: 0, z: -1 },
			{ diameter: Math.min(dx, dy), compatTags },
		),
		createConnectionPoint(
			`${partName}-front`,
			{ x: cx, y: bbox.max.y, z: cz },
			{ x: 0, y: 1, z: 0 },
			{ diameter: Math.min(dx, dz), compatTags },
		),
		createConnectionPoint(
			`${partName}-back`,
			{ x: cx, y: bbox.min.y, z: cz },
			{ x: 0, y: -1, z: 0 },
			{ diameter: Math.min(dx, dz), compatTags },
		),
		createConnectionPoint(
			`${partName}-right`,
			{ x: bbox.max.x, y: cy, z: cz },
			{ x: 1, y: 0, z: 0 },
			{ diameter: Math.min(dy, dz), compatTags },
		),
		createConnectionPoint(
			`${partName}-left`,
			{ x: bbox.min.x, y: cy, z: cz },
			{ x: -1, y: 0, z: 0 },
			{ diameter: Math.min(dy, dz), compatTags },
		),
	];
}

// ─── Helpers ───────────────────────────────────────────────────

function sanitize(id: string): string {
	return id.replace(/[^a-zA-Z0-9]/g, "_").slice(0, 16);
}

function indentCode(code: string): string {
	return code
		.trim()
		.split("\n")
		.map((line) => `  ${line}`)
		.join("\n");
}
