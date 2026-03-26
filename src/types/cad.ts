export interface Point2D {
	x: number;
	y: number;
}

export interface Point3D {
	x: number;
	y: number;
	z: number;
}

export type SketchPlane = "XY" | "XZ" | "YZ";

export type ConstraintType =
	| "coincident"
	| "distance"
	| "angle"
	| "parallel"
	| "perpendicular"
	| "tangent"
	| "symmetric"
	| "equal"
	| "horizontal"
	| "vertical";

export type FeatureType =
	| "sketch"
	| "extrude"
	| "revolve"
	| "sweep"
	| "loft"
	| "fillet"
	| "chamfer"
	| "boolean-fuse"
	| "boolean-cut"
	| "boolean-common"
	| "shell"
	| "mirror"
	| "pattern";

export type ExportFormat = "step" | "stl";

// ─── Conversion / Export Types ──────────────────────────────────

export type CadFormat =
	| "scad"
	| "step"
	| "stp"
	| "iges"
	| "igs"
	| "stl"
	| "obj"
	| "fbx"
	| "gltf"
	| "glb"
	| "usd"
	| "usda"
	| "usdc"
	| "usdz"
	| "3mf"
	| "dxf"
	| "brep"
	| "fcstd";

export type ConversionExportTarget =
	| "unity"
	| "unreal"
	| "web"
	| "3d-print"
	| "custom";

export interface CadFile {
	id: string;
	name: string;
	path: string;
	format: CadFormat;
	size: number;
	lastModified: string;
	thumbnail?: string;
}

export interface ConversionJob {
	id: string;
	status: "queued" | "processing" | "completed" | "failed";
	sourceFile: CadFile;
	targetFormat: CadFormat;
	exportTarget: ConversionExportTarget;
	progress: number;
	createdAt: string;
	completedAt?: string;
	outputPath?: string;
	error?: string;
	engine: ConversionEngine;
	llmEnhanced: boolean;
}

export type ConversionEngine = "openscad" | "freecad" | "opencascade";

export interface ConversionRequest {
	sourcePath: string;
	targetFormat: CadFormat;
	exportTarget: ConversionExportTarget;
	engine: ConversionEngine;
	llmEnhance: boolean;
	options?: ConversionOptions;
}

export interface ConversionOptions {
	scale?: number;
	units?: "mm" | "cm" | "m" | "in";
	meshQuality?: "low" | "medium" | "high" | "ultra";
	generateUVs?: boolean;
	generateNormals?: boolean;
	optimizeForTarget?: boolean;
	embedTextures?: boolean;
}

export interface FileServerEntry {
	name: string;
	path: string;
	type: "file" | "directory";
	size: number;
	lastModified: string;
	extension?: string;
}

export interface LlmEnhanceRequest {
	filePath: string;
	format: CadFormat;
	targetFormat: CadFormat;
	prompt?: string;
}

export interface LlmEnhanceResponse {
	suggestions: string[];
	optimizedParams: ConversionOptions;
	warnings: string[];
}

export const FORMAT_CATEGORIES = {
	cad: ["scad", "step", "stp", "iges", "igs", "brep", "fcstd", "dxf"],
	mesh: ["stl", "obj", "3mf"],
	gameEngine: ["fbx", "gltf", "glb"],
	usd: ["usd", "usda", "usdc", "usdz"],
} as const;

export const EXPORT_PRESETS: Record<
	ConversionExportTarget,
	{ formats: CadFormat[]; description: string }
> = {
	unity: {
		formats: ["fbx", "obj", "gltf", "glb"],
		description: "Unity-compatible formats with optimized mesh and UV data",
	},
	unreal: {
		formats: ["fbx", "usd", "usda", "usdc", "usdz", "obj"],
		description:
			"Unreal Engine formats including USD pipeline and Datasmith support",
	},
	web: {
		formats: ["gltf", "glb", "obj"],
		description: "Web-optimized formats for Three.js and WebGL rendering",
	},
	"3d-print": {
		formats: ["stl", "3mf", "obj"],
		description: "Watertight mesh formats for 3D printing",
	},
	custom: {
		formats: [
			"step",
			"stp",
			"iges",
			"igs",
			"stl",
			"obj",
			"fbx",
			"gltf",
			"glb",
			"usd",
			"usda",
			"usdc",
			"usdz",
			"3mf",
			"dxf",
			"brep",
		],
		description: "Choose any supported output format",
	},
};

export const ENGINE_INFO: Record<
	ConversionEngine,
	{ name: string; description: string; formats: string[] }
> = {
	openscad: {
		name: "OpenSCAD",
		description:
			"Programmatic CSG modeling. Best for parametric designs and .scad files.",
		formats: ["scad", "stl", "obj", "dxf", "3mf"],
	},
	freecad: {
		name: "FreeCAD",
		description:
			"Full-featured FOSS CAD platform built on OpenCascade. Handles STEP, IGES, BREP, and native FreeCAD files.",
		formats: [
			"step",
			"stp",
			"iges",
			"igs",
			"brep",
			"fcstd",
			"stl",
			"obj",
			"dxf",
		],
	},
	opencascade: {
		name: "OpenCascade (OCCT)",
		description:
			"Industrial-grade geometry kernel. Direct STEP/IGES to mesh conversion with precise tolerance control.",
		formats: ["step", "stp", "iges", "igs", "brep", "stl", "obj"],
	},
};

// ─── Sketch Types ───────────────────────────────────────────────

export interface SketchEntity {
	id: string;
	type: "line" | "circle" | "arc" | "rectangle" | "spline" | "point";
	params: Record<string, number | Point2D>;
}

export interface Constraint {
	id: string;
	type: ConstraintType;
	entities: string[];
	value?: number;
}

export interface Sketch {
	id: string;
	plane: SketchPlane;
	origin: Point3D;
	entities: SketchEntity[];
	constraints: Constraint[];
	fullyConstrained: boolean;
}

export interface Feature {
	id: string;
	name: string;
	type: FeatureType;
	visible: boolean;
	suppressed: boolean;
	params: Record<string, unknown>;
	sketchId?: string;
	/** Replicad code that generates this feature's geometry */
	code?: string;
}

export interface CadModel {
	id: string;
	name: string;
	features: Feature[];
	activeFeatureIndex: number;
}

// ─── Assembly Types ──────────────────────────────────────────────

export type MateType =
	| "coincident"
	| "concentric"
	| "distance"
	| "angle"
	| "tangent"
	| "lock"
	| "gear"
	| "rack-pinion";

export interface AssemblyPart {
	id: string;
	name: string;
	modelId: string;
	transform: {
		position: Point3D;
		rotation: Point3D;
	};
	meshData?: MeshData;
	color?: string;
	visible: boolean;
}

export interface Mate {
	id: string;
	type: MateType;
	partA: string;
	partB: string;
	faceA?: number;
	faceB?: number;
	value?: number;
	locked: boolean;
}

export interface Assembly {
	id: string;
	name: string;
	parts: AssemblyPart[];
	mates: Mate[];
}

// ─── Part Library Types ──────────────────────────────────────────

export interface PartLibraryItem {
	id: string;
	name: string;
	category: string;
	description: string;
	thumbnail?: string;
	code: string;
	tags: string[];
	/** UPC consciousness state from UniversalPartsConsciousness */
	consciousnessState?:
		| "dormant"
		| "reactive"
		| "aware"
		| "reflective"
		| "meta_aware"
		| "transcendent";
	/** UPC experiential data */
	qualia?: {
		usageCount: number;
		failureModes: string[];
		commonMates: string[];
		materialHistory: string[];
	};
	/** Dimensional parameters that can be customized */
	parameters: Record<string, { label: string; default: number; unit: string }>;
}

export interface MeshData {
	faces: {
		vertices: Float32Array;
		normals: Float32Array;
		triangles: Uint32Array;
	};
	edges: {
		vertices: Float32Array;
	};
}

export interface ChatMessage {
	id: string;
	role: "user" | "assistant" | "system";
	content: string;
	timestamp: number;
	codeBlock?: string;
	modelSnapshot?: string;
}

export interface ViewportSettings {
	showGrid: boolean;
	showAxes: boolean;
	showWireframe: boolean;
	showEdges: boolean;
	backgroundColor: string;
	projectionMode: "perspective" | "orthographic";
}

export const DEFAULT_VIEWPORT_SETTINGS: ViewportSettings = {
	showGrid: true,
	showAxes: true,
	showWireframe: false,
	showEdges: true,
	backgroundColor: "#1a1d23",
	projectionMode: "perspective",
};

export const EXPORT_FORMATS: Record<
	ExportFormat,
	{ label: string; description: string; extension: string }
> = {
	step: {
		label: "STEP",
		description: "Manufacturing-ready B-rep format",
		extension: ".step",
	},
	stl: {
		label: "STL",
		description: "3D printing mesh format",
		extension: ".stl",
	},
};
