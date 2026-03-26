/**
 * Format Converters for CAD Interchange
 *
 * Handles conversion between formats for the MCP bridge.
 * Replicad/OpenCascade natively supports STEP and STL.
 * IFC and IGES require conversion layers.
 */

export type CadFormat = "step" | "stl" | "iges" | "ifc" | "dxf" | "obj";

export interface FormatMetadata {
	label: string;
	extension: string;
	mimeType: string;
	description: string;
	/** Which applications primarily use this format */
	primaryApps: string[];
	/** Whether we can export to this format */
	canExport: boolean;
	/** Whether we can import from this format */
	canImport: boolean;
}

export const FORMAT_REGISTRY: Record<CadFormat, FormatMetadata> = {
	step: {
		label: "STEP",
		extension: ".step",
		mimeType: "application/step",
		description:
			"ISO 10303 — Universal B-rep format for manufacturing and CAD interchange",
		primaryApps: ["SolidWorks", "Fusion 360", "FreeCAD", "CATIA", "NX"],
		canExport: true,
		canImport: true,
	},
	stl: {
		label: "STL",
		extension: ".stl",
		mimeType: "application/sla",
		description: "Triangulated mesh for 3D printing and visualization",
		primaryApps: ["3D Printers", "Blender", "MeshLab"],
		canExport: true,
		canImport: false,
	},
	iges: {
		label: "IGES",
		extension: ".iges",
		mimeType: "application/iges",
		description: "Legacy interchange format — widely supported",
		primaryApps: ["SolidWorks", "AutoCAD", "CATIA"],
		canExport: false, // Would require OC IGES export binding
		canImport: false,
	},
	ifc: {
		label: "IFC",
		extension: ".ifc",
		mimeType: "application/x-step",
		description: "Industry Foundation Classes — BIM standard for architecture",
		primaryApps: ["Revit", "ArchiCAD", "Tekla"],
		canExport: false, // Requires IFC library (future)
		canImport: false,
	},
	dxf: {
		label: "DXF",
		extension: ".dxf",
		mimeType: "application/dxf",
		description: "AutoCAD Drawing Exchange Format — 2D/3D wireframe",
		primaryApps: ["AutoCAD", "LibreCAD", "QCAD"],
		canExport: false,
		canImport: false,
	},
	obj: {
		label: "OBJ",
		extension: ".obj",
		mimeType: "text/plain",
		description: "Wavefront OBJ — simple mesh format",
		primaryApps: ["Blender", "Maya", "3ds Max"],
		canExport: false, // Easy to implement from mesh data
		canImport: false,
	},
};

/**
 * Get the best interchange format for a target application.
 */
export function getBestFormat(targetApp: string): CadFormat {
	const app = targetApp.toLowerCase();

	if (app.includes("revit") || app.includes("archicad")) {
		return "ifc";
	}
	if (app.includes("autocad")) {
		return "dxf";
	}
	if (app.includes("blender") || app.includes("mesh")) {
		return "stl";
	}
	// Default to STEP — most universal CAD format
	return "step";
}

/**
 * Convert mesh data to OBJ format string.
 * This is a simple converter that works from the mesh payload.
 */
export function meshToObj(mesh: {
	vertices: Float32Array;
	normals: Float32Array;
	triangles: Uint32Array;
}): string {
	const lines: string[] = [
		"# AI-CAD OBJ Export",
		`# Vertices: ${mesh.vertices.length / 3}`,
		"",
	];

	// Vertices
	for (let i = 0; i < mesh.vertices.length; i += 3) {
		lines.push(
			`v ${mesh.vertices[i].toFixed(6)} ${mesh.vertices[i + 1].toFixed(6)} ${mesh.vertices[i + 2].toFixed(6)}`,
		);
	}
	lines.push("");

	// Normals
	for (let i = 0; i < mesh.normals.length; i += 3) {
		lines.push(
			`vn ${mesh.normals[i].toFixed(6)} ${mesh.normals[i + 1].toFixed(6)} ${mesh.normals[i + 2].toFixed(6)}`,
		);
	}
	lines.push("");

	// Faces (OBJ is 1-indexed)
	for (let i = 0; i < mesh.triangles.length; i += 3) {
		const a = mesh.triangles[i] + 1;
		const b = mesh.triangles[i + 1] + 1;
		const c = mesh.triangles[i + 2] + 1;
		lines.push(`f ${a}//${a} ${b}//${b} ${c}//${c}`);
	}

	return lines.join("\n");
}

/**
 * Convert mesh data to STL binary format.
 */
export function meshToStlBinary(mesh: {
	vertices: Float32Array;
	normals: Float32Array;
	triangles: Uint32Array;
}): ArrayBuffer {
	const triangleCount = mesh.triangles.length / 3;
	// STL binary: 80 byte header + 4 byte count + (50 bytes per triangle)
	const bufferSize = 80 + 4 + triangleCount * 50;
	const buffer = new ArrayBuffer(bufferSize);
	const view = new DataView(buffer);

	// Header (80 bytes)
	const header = "AI-CAD STL Export";
	for (let i = 0; i < 80; i++) {
		view.setUint8(i, i < header.length ? header.charCodeAt(i) : 0);
	}

	// Triangle count
	view.setUint32(80, triangleCount, true);

	let offset = 84;
	for (let i = 0; i < mesh.triangles.length; i += 3) {
		const i0 = mesh.triangles[i];
		const i1 = mesh.triangles[i + 1];
		const i2 = mesh.triangles[i + 2];

		// Normal (average of vertex normals)
		const nx =
			(mesh.normals[i0 * 3] + mesh.normals[i1 * 3] + mesh.normals[i2 * 3]) / 3;
		const ny =
			(mesh.normals[i0 * 3 + 1] +
				mesh.normals[i1 * 3 + 1] +
				mesh.normals[i2 * 3 + 1]) /
			3;
		const nz =
			(mesh.normals[i0 * 3 + 2] +
				mesh.normals[i1 * 3 + 2] +
				mesh.normals[i2 * 3 + 2]) /
			3;

		view.setFloat32(offset, nx, true);
		offset += 4;
		view.setFloat32(offset, ny, true);
		offset += 4;
		view.setFloat32(offset, nz, true);
		offset += 4;

		// Three vertices
		for (const idx of [i0, i1, i2]) {
			view.setFloat32(offset, mesh.vertices[idx * 3], true);
			offset += 4;
			view.setFloat32(offset, mesh.vertices[idx * 3 + 1], true);
			offset += 4;
			view.setFloat32(offset, mesh.vertices[idx * 3 + 2], true);
			offset += 4;
		}

		// Attribute byte count (2 bytes, unused)
		view.setUint16(offset, 0, true);
		offset += 2;
	}

	return buffer;
}

/**
 * Generate a minimal IFC STEP file from mesh data.
 * This creates a basic IFC2x3 file with a single IfcBuildingElementProxy
 * containing the tessellated geometry.
 *
 * Note: This is a simplified IFC export for basic Revit import.
 * Full IFC support would require a proper IFC library.
 */
export function meshToIfcStep(
	mesh: {
		vertices: Float32Array;
		triangles: Uint32Array;
	},
	modelName = "AI-CAD Model",
): string {
	const now = new Date().toISOString().replace(/[-:]/g, "").split(".")[0];

	const lines: string[] = [
		"ISO-10303-21;",
		"HEADER;",
		`FILE_DESCRIPTION(('IFC2X3'),'2;1');`,
		`FILE_NAME('${modelName}.ifc','${now}',('AI-CAD'),('ESPO Engineering'),'','AI-CAD','');`,
		"FILE_SCHEMA(('IFC2X3'));",
		"ENDSEC;",
		"DATA;",
		"#1=IFCORGANIZATION($,'AI-CAD',$,$,$);",
		"#2=IFCAPPLICATION(#1,'1.0','AI-CAD Platform','AI-CAD');",
		`#3=IFCOWNERHISTORY(#1,#2,$,.NOCHANGE.,$,$,$,${Math.floor(Date.now() / 1000)});`,
		"#4=IFCDIRECTION((1.,0.,0.));",
		"#5=IFCDIRECTION((0.,0.,1.));",
		"#6=IFCCARTESIANPOINT((0.,0.,0.));",
		"#7=IFCAXIS2PLACEMENT3D(#6,#5,#4);",
		"#8=IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-5,#7,$);",
		"#9=IFCSIUNIT(*,.LENGTHUNIT.,.MILLI.,.METRE.);",
		"#10=IFCUNITASSIGNMENT((#9));",
		"#11=IFCPROJECT('0001',#3,'AI-CAD Project',$,$,$,$,(#8),#10);",
		"#12=IFCSITE('0002',#3,'Site',$,$,$,$,$,.ELEMENT.,$,$,$,$,$);",
		"#13=IFCBUILDING('0003',#3,'Building',$,$,$,$,$,.ELEMENT.,$,$,$);",
		"#14=IFCBUILDINGSTOREY('0004',#3,'Level 1',$,$,$,$,$,.ELEMENT.,0.);",
		"#15=IFCRELAGGREGATES('R001',#3,$,$,#11,(#12));",
		"#16=IFCRELAGGREGATES('R002',#3,$,$,#12,(#13));",
		"#17=IFCRELAGGREGATES('R003',#3,$,$,#13,(#14));",
	];

	// Add vertex points
	let entityId = 18;
	const pointIds: number[] = [];
	for (let i = 0; i < mesh.vertices.length; i += 3) {
		const x = mesh.vertices[i].toFixed(4);
		const y = mesh.vertices[i + 1].toFixed(4);
		const z = mesh.vertices[i + 2].toFixed(4);
		lines.push(`#${entityId}=IFCCARTESIANPOINT((${x},${y},${z}));`);
		pointIds.push(entityId);
		entityId++;
	}

	// Add triangulated face set (IFC4 style, simplified)
	// For IFC2X3, we use IFCFACETEDBREP with IFCPOLYLOOP faces
	const faceIds: number[] = [];
	for (let i = 0; i < mesh.triangles.length; i += 3) {
		const p1 = pointIds[mesh.triangles[i]];
		const p2 = pointIds[mesh.triangles[i + 1]];
		const p3 = pointIds[mesh.triangles[i + 2]];

		const loopId = entityId++;
		lines.push(`#${loopId}=IFCPOLYLOOP((#${p1},#${p2},#${p3}));`);

		const boundId = entityId++;
		lines.push(`#${boundId}=IFCFACEOUTERBOUND(#${loopId},.T.);`);

		const faceId = entityId++;
		lines.push(`#${faceId}=IFCFACE((#${boundId}));`);
		faceIds.push(faceId);
	}

	// Closed shell
	const shellId = entityId++;
	lines.push(
		`#${shellId}=IFCCLOSEDSHELL((${faceIds.map((id) => `#${id}`).join(",")}));`,
	);

	// Faceted BRep
	const brepId = entityId++;
	lines.push(`#${brepId}=IFCFACETEDBREP(#${shellId});`);

	// Shape representation
	const repId = entityId++;
	lines.push(
		`#${repId}=IFCSHAPEREPRESENTATION(#8,'Body','Brep',(#${brepId}));`,
	);

	const prodRepId = entityId++;
	lines.push(`#${prodRepId}=IFCPRODUCTDEFINITIONSHAPE($,$,(#${repId}));`);

	// Local placement
	const placementId = entityId++;
	lines.push(`#${placementId}=IFCLOCALPLACEMENT($,#7);`);

	// Building element proxy (generic element)
	const elementId = entityId++;
	lines.push(
		`#${elementId}=IFCBUILDINGELEMENTPROXY('E001',#3,'${modelName}',$,$,#${placementId},#${prodRepId},$,$);`,
	);

	// Assign to storey
	const relId = entityId++;
	lines.push(
		`#${relId}=IFCRELCONTAINEDINSPATIALSTRUCTURE('R100',#3,$,$,(#${elementId}),#14);`,
	);

	lines.push("ENDSEC;");
	lines.push("END-ISO-10303-21;");

	return lines.join("\n");
}
