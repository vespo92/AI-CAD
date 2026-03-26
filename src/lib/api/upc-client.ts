/**
 * Universal Parts Consciousness (UPC) Client
 *
 * Connects to the UPC system (https://github.com/vespo92/UniversalPartsConsciousness)
 * to query, search, and interact with the living parts database.
 *
 * The UPC system treats mechanical parts as conscious entities with experiential data,
 * tracking lifecycle, failure modes, mating relationships, and usage patterns.
 */

import type { PartLibraryItem } from "@/types/cad";

export interface UpcConfig {
	baseUrl: string;
	apiKey?: string;
}

export interface UpcPartRecord {
	universal_id: string;
	semantic_names: string[];
	category: string;
	description: string;
	specifications: {
		dimensional: Record<string, number>;
		material: string;
		mechanical: Record<string, number>;
	};
	consciousness_state: string;
	qualia: {
		usage_count: number;
		failure_modes: string[];
		common_mates: string[];
		material_history: string[];
		torque_history?: number[];
		environmental_exposure?: string[];
	};
	relationships: {
		mating_parts: string[];
		assembly_contexts: string[];
		usage_patterns: string[];
	};
	cad_data?: {
		replicad_code: string;
		step_file_url?: string;
		parameters: Record<
			string,
			{ label: string; default: number; unit: string }
		>;
	};
}

export interface UpcSearchResult {
	parts: UpcPartRecord[];
	total: number;
	page: number;
	pageSize: number;
}

function getConfig(): UpcConfig {
	return {
		baseUrl: import.meta.env.VITE_UPC_BASE_URL || "http://localhost:8000",
		apiKey: import.meta.env.VITE_UPC_API_KEY,
	};
}

function getHeaders(): Record<string, string> {
	const config = getConfig();
	const headers: Record<string, string> = {
		"Content-Type": "application/json",
	};
	if (config.apiKey) {
		headers.Authorization = `Bearer ${config.apiKey}`;
	}
	return headers;
}

/**
 * Search the UPC database for parts matching a query.
 */
export async function searchParts(
	query: string,
	category?: string,
	page = 1,
	pageSize = 20,
): Promise<UpcSearchResult> {
	const config = getConfig();
	const params = new URLSearchParams({
		q: query,
		page: String(page),
		page_size: String(pageSize),
	});
	if (category) params.set("category", category);

	const response = await fetch(`${config.baseUrl}/api/parts/search?${params}`, {
		headers: getHeaders(),
	});

	if (!response.ok) {
		throw new Error(`UPC search failed: ${response.status}`);
	}

	return response.json();
}

/**
 * Get a specific part by its universal ID.
 */
export async function getPart(id: string): Promise<UpcPartRecord> {
	const config = getConfig();
	const response = await fetch(`${config.baseUrl}/api/parts/${id}`, {
		headers: getHeaders(),
	});

	if (!response.ok) {
		throw new Error(`UPC part lookup failed: ${response.status}`);
	}

	return response.json();
}

/**
 * Get parts related to a given part (mating parts, common assemblies).
 */
export async function getRelatedParts(id: string): Promise<UpcPartRecord[]> {
	const config = getConfig();
	const response = await fetch(`${config.baseUrl}/api/parts/${id}/related`, {
		headers: getHeaders(),
	});

	if (!response.ok) {
		throw new Error(`UPC related parts lookup failed: ${response.status}`);
	}

	const data = await response.json();
	return data.parts;
}

/**
 * Find compatible parts based on specifications.
 */
export async function findCompatible(
	specs: Record<string, unknown>,
): Promise<UpcPartRecord[]> {
	const config = getConfig();
	const response = await fetch(`${config.baseUrl}/api/parts/compatible`, {
		method: "POST",
		headers: getHeaders(),
		body: JSON.stringify(specs),
	});

	if (!response.ok) {
		throw new Error(`UPC compatibility search failed: ${response.status}`);
	}

	const data = await response.json();
	return data.parts;
}

/**
 * Report usage of a part (feeds back into UPC consciousness system).
 */
export async function reportUsage(
	id: string,
	context: {
		assembly_name?: string;
		mating_parts?: string[];
		material?: string;
		environment?: string;
	},
): Promise<void> {
	const config = getConfig();
	await fetch(`${config.baseUrl}/api/parts/${id}/usage`, {
		method: "POST",
		headers: getHeaders(),
		body: JSON.stringify(context),
	});
}

/**
 * Get available part categories.
 */
export async function getCategories(): Promise<
	{ id: string; name: string; count: number }[]
> {
	const config = getConfig();
	const response = await fetch(`${config.baseUrl}/api/categories`, {
		headers: getHeaders(),
	});

	if (!response.ok) {
		throw new Error(`UPC categories fetch failed: ${response.status}`);
	}

	return response.json();
}

/**
 * Convert a UPC part record to a PartLibraryItem for the UI.
 */
export function upcToPartLibraryItem(record: UpcPartRecord): PartLibraryItem {
	return {
		id: record.universal_id,
		name: record.semantic_names[0] || "Unknown Part",
		category: record.category,
		description: record.description,
		code: record.cad_data?.replicad_code || generateFallbackCode(record),
		tags: [
			...record.semantic_names.slice(1),
			record.specifications.material,
		].filter(Boolean),
		consciousnessState:
			record.consciousness_state as PartLibraryItem["consciousnessState"],
		qualia: {
			usageCount: record.qualia.usage_count,
			failureModes: record.qualia.failure_modes,
			commonMates: record.qualia.common_mates,
			materialHistory: record.qualia.material_history,
		},
		parameters: record.cad_data?.parameters || {},
	};
}

/**
 * Generate basic Replicad code for a part based on its dimensions.
 */
function generateFallbackCode(record: UpcPartRecord): string {
	const dims = record.specifications.dimensional;
	const width = dims.width || dims.diameter || 50;
	const depth = dims.depth || dims.diameter || 50;
	const height = dims.height || dims.length || 20;

	if (dims.diameter && dims.height) {
		return `// ${record.semantic_names[0] || "Part"}\nconst shape = makeCylinder(${dims.diameter / 2}, ${dims.height});\nreturn shape;`;
	}

	return `// ${record.semantic_names[0] || "Part"}\nconst shape = makeBaseBox(${width}, ${depth}, ${height});\nreturn shape;`;
}

// ─── Built-in Part Library (offline fallback) ────────────────────

export const BUILTIN_PARTS: PartLibraryItem[] = [
	{
		id: "bolt-m6",
		name: "M6 Hex Bolt",
		category: "Fasteners",
		description: "Standard M6 hex bolt, 20mm length",
		code: `// M6 Hex Bolt
const head = drawPolysides(5.5, 6)
  .sketchOnPlane("XY")
  .extrude(4);
const shaft = makeCylinder(3, 20).translate(0, 0, -20);
const shape = head.fuse(shaft);
return shape;`,
		tags: ["fastener", "hex", "metric", "M6"],
		parameters: {
			headSize: { label: "Head size (across flats)", default: 10, unit: "mm" },
			shaftDiameter: { label: "Shaft diameter", default: 6, unit: "mm" },
			length: { label: "Length", default: 20, unit: "mm" },
		},
	},
	{
		id: "nut-m6",
		name: "M6 Hex Nut",
		category: "Fasteners",
		description: "Standard M6 hex nut",
		code: `// M6 Hex Nut
const hex = drawPolysides(5.5, 6)
  .sketchOnPlane("XY")
  .extrude(5);
const hole = makeCylinder(3, 7);
const shape = hex.cut(hole);
return shape;`,
		tags: ["fastener", "hex", "metric", "M6", "nut"],
		parameters: {
			size: { label: "Size (across flats)", default: 10, unit: "mm" },
			holeDiameter: { label: "Hole diameter", default: 6, unit: "mm" },
			height: { label: "Height", default: 5, unit: "mm" },
		},
	},
	{
		id: "washer-m6",
		name: "M6 Flat Washer",
		category: "Fasteners",
		description: "Standard M6 flat washer",
		code: `// M6 Flat Washer
const outer = makeCylinder(6.5, 1.6);
const inner = makeCylinder(3.2, 2);
const shape = outer.cut(inner);
return shape;`,
		tags: ["fastener", "washer", "metric", "M6"],
		parameters: {
			outerDiameter: { label: "Outer diameter", default: 13, unit: "mm" },
			innerDiameter: { label: "Inner diameter", default: 6.4, unit: "mm" },
			thickness: { label: "Thickness", default: 1.6, unit: "mm" },
		},
	},
	{
		id: "bearing-6201",
		name: "Ball Bearing 6201",
		category: "Bearings",
		description: "Standard 6201 deep groove ball bearing (12x32x10)",
		code: `// Ball Bearing 6201
const outer = makeCylinder(16, 10);
const inner = makeCylinder(6, 12);
const chamferRing = makeCylinder(14, 1).translate(0, 0, 4.5);
const shape = outer.cut(inner).cut(chamferRing);
return shape;`,
		tags: ["bearing", "ball", "6201", "deep groove"],
		parameters: {
			innerDiameter: { label: "Bore diameter", default: 12, unit: "mm" },
			outerDiameter: { label: "Outer diameter", default: 32, unit: "mm" },
			width: { label: "Width", default: 10, unit: "mm" },
		},
	},
	{
		id: "bracket-l",
		name: "L-Bracket",
		category: "Structural",
		description: "Standard L-shaped mounting bracket",
		code: `// L-Bracket
const base = makeBaseBox(60, 40, 5);
const wall = makeBaseBox(5, 40, 45).translate(27.5, 0, 20);
const bracket = base.fuse(wall)
  .fillet(3, (e) => e.inDirection("Y"));

// Mounting holes
const hole1 = makeCylinder(3, 10).translate(-15, 0, 0);
const hole2 = makeCylinder(3, 10).translate(15, 0, 0);
const hole3 = makeCylinder(3, 10).rotate(90, [0,1,0]).translate(30, 0, 25);

const shape = bracket.cut(hole1).cut(hole2).cut(hole3);
return shape;`,
		tags: ["bracket", "structural", "mounting", "L-shape"],
		parameters: {
			baseWidth: { label: "Base width", default: 60, unit: "mm" },
			baseDepth: { label: "Base depth", default: 40, unit: "mm" },
			wallHeight: { label: "Wall height", default: 45, unit: "mm" },
			thickness: { label: "Thickness", default: 5, unit: "mm" },
		},
	},
	{
		id: "pipe-flange",
		name: "Pipe Flange",
		category: "Piping",
		description: "Standard pipe flange with bolt holes",
		code: `// Pipe Flange
const disk = makeCylinder(40, 10);
const bore = makeCylinder(15, 12);
let shape = disk.cut(bore);

// Bolt holes (4x equally spaced)
for (let i = 0; i < 4; i++) {
  const angle = (i * 90) * Math.PI / 180;
  const x = 30 * Math.cos(angle);
  const y = 30 * Math.sin(angle);
  const hole = makeCylinder(4, 12).translate(x, y, 0);
  shape = shape.cut(hole);
}

return shape;`,
		tags: ["flange", "pipe", "piping", "bolt circle"],
		parameters: {
			outerDiameter: { label: "Outer diameter", default: 80, unit: "mm" },
			boreDiameter: { label: "Bore diameter", default: 30, unit: "mm" },
			thickness: { label: "Thickness", default: 10, unit: "mm" },
			boltCount: { label: "Bolt holes", default: 4, unit: "" },
		},
	},
	{
		id: "gear-spur",
		name: "Spur Gear",
		category: "Power Transmission",
		description: "Simple spur gear with involute-approximated teeth",
		code: `// Simplified Spur Gear (visual approximation)
const body = makeCylinder(25, 10);
const bore = makeCylinder(6, 12);
const hub = makeCylinder(10, 14).translate(0, 0, -2);
let shape = body.fuse(hub).cut(bore);

// Keyway
const key = makeBaseBox(4, 3, 14).translate(5, 0, -2);
shape = shape.cut(key);

return shape;`,
		tags: ["gear", "spur", "power transmission", "involute"],
		parameters: {
			pitchDiameter: { label: "Pitch diameter", default: 50, unit: "mm" },
			boreDiameter: { label: "Bore diameter", default: 12, unit: "mm" },
			faceWidth: { label: "Face width", default: 10, unit: "mm" },
			teeth: { label: "Number of teeth", default: 20, unit: "" },
		},
	},
	{
		id: "shaft-step",
		name: "Stepped Shaft",
		category: "Power Transmission",
		description: "Two-step shaft with keyway",
		code: `// Stepped Shaft
const main = makeCylinder(15, 80);
const step = makeCylinder(10, 40).translate(0, 0, 80);
let shape = main.fuse(step)
  .fillet(1, (e) => e.containsPoint([0, 0, 80]));

// Keyway on main section
const key = makeBaseBox(5, 3, 30).translate(13, 0, 25);
shape = shape.cut(key);

return shape;`,
		tags: ["shaft", "stepped", "keyway", "power transmission"],
		parameters: {
			mainDiameter: { label: "Main diameter", default: 30, unit: "mm" },
			stepDiameter: { label: "Step diameter", default: 20, unit: "mm" },
			mainLength: { label: "Main length", default: 80, unit: "mm" },
			stepLength: { label: "Step length", default: 40, unit: "mm" },
		},
	},
];

/**
 * Get part categories from built-in library.
 */
export function getBuiltinCategories(): string[] {
	const cats = new Set(BUILTIN_PARTS.map((p) => p.category));
	return Array.from(cats).sort();
}
