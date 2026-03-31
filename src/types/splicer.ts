/**
 * Splicer Types
 *
 * Splicers define connection points on parts that enable automatic
 * alignment and joining. A splicer is a named port on a part geometry
 * with a position, orientation, and compatibility tags.
 */

import type { Point3D } from "./cad";

// ─── Connection Point ──────────────────────────────────────────

export type SplicerGender = "male" | "female" | "neutral";

export interface ConnectionPoint {
	id: string;
	/** Human-readable name (e.g. "bolt-hole-1", "flange-face") */
	name: string;
	/** Position relative to part origin */
	position: Point3D;
	/** Normal direction of the connection face */
	normal: Point3D;
	/** Up vector for rotational alignment */
	up: Point3D;
	/** Connection gender — male plugs into female, neutral connects to anything */
	gender: SplicerGender;
	/** Diameter/size of the connection interface in mm */
	diameter: number;
	/** Tags for compatibility matching (e.g. "M6", "pipe-1/2", "flange-DN50") */
	compatTags: string[];
}

// ─── Splicer Definition ────────────────────────────────────────

export interface SplicerDefinition {
	id: string;
	/** Part ID this splicer belongs to */
	partId: string;
	/** Part name for display */
	partName: string;
	/** All connection points on this part */
	connections: ConnectionPoint[];
	/** Replicad code that generates this part */
	code: string;
	/** Optional parameter overrides that were used to generate this part */
	parameters?: Record<string, number>;
	/** Timestamp of creation */
	createdAt: number;
	/** Timestamp of last modification */
	updatedAt: number;
}

// ─── Splice Joint ──────────────────────────────────────────────

export type SpliceJointType =
	| "butt" // Face-to-face contact
	| "insert" // Male inserts into female
	| "weld" // Fused joint (boolean union)
	| "fastener" // Connected via fastener (bolt, rivet)
	| "press-fit" // Interference fit
	| "snap" // Snap-fit connection
	| "threaded"; // Threaded connection

export interface SpliceJoint {
	id: string;
	/** Source splicer definition */
	sourceSplicerId: string;
	/** Source connection point ID */
	sourceConnectionId: string;
	/** Target splicer definition */
	targetSplicerId: string;
	/** Target connection point ID */
	targetConnectionId: string;
	/** Type of joint */
	jointType: SpliceJointType;
	/** Whether to perform boolean union on the geometry */
	fuseGeometry: boolean;
	/** Optional gap/offset between faces in mm */
	offset: number;
	/** Whether this joint is locked (prevents disconnection) */
	locked: boolean;
}

// ─── Splice Assembly ───────────────────────────────────────────

export interface SpliceAssembly {
	id: string;
	name: string;
	description: string;
	/** All splicer definitions in this assembly */
	splicers: SplicerDefinition[];
	/** All joints connecting splicers */
	joints: SpliceJoint[];
	/** Generated combined Replicad code */
	combinedCode?: string;
	/** Tags for categorization */
	tags: string[];
	createdAt: number;
	updatedAt: number;
}

// ─── Extrusion Profile for Splicer ─────────────────────────────

export type ExtrusionType = "linear" | "tapered" | "twisted" | "along-path";

export interface ExtrusionProfile {
	id: string;
	name: string;
	/** The 2D sketch code (Replicad draw commands) */
	sketchCode: string;
	/** Type of extrusion */
	extrusionType: ExtrusionType;
	/** Parameters for the extrusion */
	params: {
		height?: number;
		taperAngle?: number;
		twistAngle?: number;
		/** Replicad code for sweep path (for along-path type) */
		pathCode?: string;
	};
	/** Connection points auto-generated at extrusion ends */
	endConnections: {
		start: Omit<ConnectionPoint, "id">;
		end: Omit<ConnectionPoint, "id">;
	};
}
