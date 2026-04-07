/**
 * Layer Identification & 2D-to-3D Reconstruction
 *
 * Public API for parsing DXF files, classifying layers,
 * and proposing 3D features from 2D drawings.
 */

export { parseDxfFile } from "./dxf-parser";
export { classifyLayer, classifyLayersWithContext } from "./layer-classifier";
export {
	analyzeIsometricDrawing,
	inverseIsometric,
	forwardIsometric,
} from "./isometric-analyzer";
export { extractProfiles } from "./profile-extractor";
export { reconstructFrom2D } from "./reconstruction";

// Re-export types
export type {
	LayerClassification,
	ClassificationConfidence,
	ClassifiedLayer,
	DxfEntity,
	DxfEntityType,
	DxfLineEntity,
	DxfCircleEntity,
	DxfArcEntity,
	DxfPolylineEntity,
	DxfSplineEntity,
	DxfEllipseEntity,
	DxfTextEntity,
	DxfDimensionEntity,
	DxfHatchEntity,
	DxfInsertEntity,
	IsometricProjectionType,
	IsometricAnalysis,
	DetectedView,
	ExtractedDimension,
	SymmetryAxis,
	ExtractedProfile,
	ProposedFeature,
	ReconstructionResult,
} from "./types";
