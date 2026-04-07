/**
 * Types for CAD Layer Identification & Isometric-to-3D Conversion
 *
 * Defines the data structures used when parsing DXF/DWG files,
 * classifying layers by purpose, and reconstructing 3D geometry
 * from 2D isometric drawings.
 */

import type { Point2D, Point3D } from "@/types/cad";

// ─── DXF Layer Classification ──────────────────────────────────

/** Semantic purpose of a CAD layer */
export type LayerClassification =
	| "visible-outline" // Solid lines showing visible edges
	| "hidden-lines" // Dashed lines representing hidden/obscured edges
	| "centerlines" // Center lines / axes of symmetry
	| "dimensions" // Dimension annotations
	| "section-hatching" // Cross-section fill patterns
	| "construction" // Construction/reference geometry
	| "annotations" // Text, leaders, notes
	| "phantom" // Phantom lines (alternate positions, etc.)
	| "cutting-plane" // Section cutting plane indicators
	| "break-lines" // Break lines indicating shortened views
	| "detail-boundary" // Detail view boundaries
	| "unknown"; // Unclassified

/** Confidence level for automatic classification */
export type ClassificationConfidence = "high" | "medium" | "low";

/** A classified CAD layer with its entities */
export interface ClassifiedLayer {
	/** Original layer name from the DXF file */
	name: string;
	/** Color index (ACI) from the DXF file */
	colorIndex: number;
	/** Detected linetype (CONTINUOUS, DASHED, CENTER, etc.) */
	linetype: string;
	/** Line weight in mm (-1 = default) */
	lineWeight: number;
	/** Whether the layer is visible/on */
	visible: boolean;
	/** Whether the layer is frozen */
	frozen: boolean;
	/** Semantic classification */
	classification: LayerClassification;
	/** How confident we are in the classification */
	confidence: ClassificationConfidence;
	/** Why this classification was chosen */
	classificationReason: string;
	/** 2D entities belonging to this layer */
	entities: DxfEntity[];
}

// ─── DXF Entity Types ──────────────────────────────────────────

export type DxfEntityType =
	| "line"
	| "circle"
	| "arc"
	| "polyline"
	| "lwpolyline"
	| "spline"
	| "ellipse"
	| "point"
	| "text"
	| "mtext"
	| "dimension"
	| "insert" // block reference
	| "hatch";

export interface DxfEntityBase {
	type: DxfEntityType;
	layer: string;
	colorIndex?: number;
	linetype?: string;
}

export interface DxfLineEntity extends DxfEntityBase {
	type: "line";
	start: Point2D;
	end: Point2D;
}

export interface DxfCircleEntity extends DxfEntityBase {
	type: "circle";
	center: Point2D;
	radius: number;
}

export interface DxfArcEntity extends DxfEntityBase {
	type: "arc";
	center: Point2D;
	radius: number;
	startAngle: number;
	endAngle: number;
}

export interface DxfPolylineEntity extends DxfEntityBase {
	type: "polyline" | "lwpolyline";
	vertices: Point2D[];
	closed: boolean;
	bulges?: number[];
}

export interface DxfSplineEntity extends DxfEntityBase {
	type: "spline";
	controlPoints: Point2D[];
	degree: number;
	closed: boolean;
}

export interface DxfEllipseEntity extends DxfEntityBase {
	type: "ellipse";
	center: Point2D;
	majorAxis: Point2D;
	minorAxisRatio: number;
	startAngle: number;
	endAngle: number;
}

export interface DxfTextEntity extends DxfEntityBase {
	type: "text" | "mtext";
	position: Point2D;
	text: string;
	height: number;
	rotation: number;
}

export interface DxfDimensionEntity extends DxfEntityBase {
	type: "dimension";
	definitionPoint: Point2D;
	textMidpoint: Point2D;
	dimensionText: string;
	value: number;
}

export interface DxfHatchEntity extends DxfEntityBase {
	type: "hatch";
	patternName: string;
	boundaryPaths: Point2D[][];
}

export interface DxfInsertEntity extends DxfEntityBase {
	type: "insert";
	blockName: string;
	position: Point2D;
	scale: Point2D;
	rotation: number;
}

export type DxfEntity =
	| DxfLineEntity
	| DxfCircleEntity
	| DxfArcEntity
	| DxfPolylineEntity
	| DxfSplineEntity
	| DxfEllipseEntity
	| DxfTextEntity
	| DxfDimensionEntity
	| DxfHatchEntity
	| DxfInsertEntity;

// ─── Isometric Projection Types ────────────────────────────────

/** Which isometric projection convention is used */
export type IsometricProjectionType =
	| "isometric-30" // Standard 30° isometric
	| "dimetric" // Two equal angles
	| "trimetric" // Three different angles
	| "cabinet" // 45° oblique, half-depth
	| "cavalier"; // 45° oblique, full-depth

/** A detected view in a multi-view drawing */
export interface DetectedView {
	/** What type of view this is */
	viewType:
		| "front"
		| "top"
		| "right"
		| "left"
		| "bottom"
		| "rear"
		| "isometric"
		| "section"
		| "detail"
		| "auxiliary";
	/** Bounding box of this view in the drawing */
	bounds: { min: Point2D; max: Point2D };
	/** Entities belonging to this view */
	entities: DxfEntity[];
	/** The projection plane normal (for orthographic views) */
	projectionNormal?: Point3D;
}

/** Result of isometric-to-3D analysis */
export interface IsometricAnalysis {
	/** Detected projection type */
	projectionType: IsometricProjectionType;
	/** Detected views in the drawing */
	views: DetectedView[];
	/** Extracted dimension values mapped to edges */
	dimensions: ExtractedDimension[];
	/** Detected symmetry axes */
	symmetryAxes: SymmetryAxis[];
	/** Overall confidence in the analysis */
	confidence: ClassificationConfidence;
}

export interface ExtractedDimension {
	/** The numeric value */
	value: number;
	/** Unit (mm, in, etc.) */
	unit: string;
	/** Which entities this dimension refers to */
	entityRefs: string[];
	/** Dimension direction in 3D space */
	direction: Point3D;
}

export interface SymmetryAxis {
	/** Start point on the axis */
	start: Point2D;
	/** End point on the axis */
	end: Point2D;
	/** Which 3D axis this maps to */
	mappedAxis: "X" | "Y" | "Z";
}

// ─── 3D Reconstruction Types ───────────────────────────────────

/** A 2D profile extracted from drawing layers, ready for 3D ops */
export interface ExtractedProfile {
	/** Unique identifier */
	id: string;
	/** Human-readable label */
	label: string;
	/** The closed 2D wire/profile */
	contour: Point2D[];
	/** Inner holes/cutouts */
	holes: Point2D[][];
	/** Which plane this profile lies on */
	plane: "XY" | "XZ" | "YZ";
	/** Offset along the plane normal */
	planeOffset: number;
	/** Source layer classification */
	sourceClassification: LayerClassification;
}

/** A proposed 3D feature derived from the 2D analysis */
export interface ProposedFeature {
	/** Feature type to create */
	type: "extrude" | "revolve" | "sweep" | "loft" | "cut";
	/** Human-readable description */
	description: string;
	/** Profile(s) involved */
	profiles: ExtractedProfile[];
	/** Parameters for the operation */
	params: Record<string, unknown>;
	/** Confidence in this reconstruction */
	confidence: ClassificationConfidence;
	/** Generated replicad code preview */
	codePreview: string;
}

/** Full result of 2D-to-3D reconstruction pipeline */
export interface ReconstructionResult {
	/** Original classified layers */
	layers: ClassifiedLayer[];
	/** Isometric analysis (if applicable) */
	isometricAnalysis?: IsometricAnalysis;
	/** Extracted 2D profiles */
	profiles: ExtractedProfile[];
	/** Proposed 3D features */
	proposedFeatures: ProposedFeature[];
	/** Warnings and notes for the user */
	warnings: string[];
}
