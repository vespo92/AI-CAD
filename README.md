# AI-CAD

Open-source, AI-driven parametric CAD platform. Describe designs in plain English, generate 3D models, and export to manufacturing formats.

## Features

- **NLP-to-CAD** — Chat with an LLM to generate parametric 3D models from natural language
- **Feature-Based Parametric Modeling** — Add/remove/toggle features that drive Replicad code generation: extrude, revolve, fillet, chamfer, boolean, mirror, pattern
- **Real-time 3D Viewport** — Three.js/React Three Fiber with orbit controls, wireframe, edge highlighting
- **Code Editor** — Monaco editor for Replicad TypeScript with live execution
- **Engine Console** — Real-time logging of WASM engine events, execution timing, and mesh statistics
- **Runtime LLM Configuration** — Switch between OpenAI / Anthropic / Ollama providers and models from the Settings page
- **Format Conversion** — STEP, IGES, STL, OBJ, FBX, GLTF, USD, 3MF, DXF, BREP (18+ formats)
- **Assembly Management** — Mate definitions: coincident, concentric, distance, angle, tangent, gear
- **Universal Parts Consciousness** — Intelligent parts library tracking part relationships, failure modes, and usage patterns ([UPC](https://github.com/vespo92/UniversalPartsConsciousness))
- **MCP Server** — Expose CAD operations as Model Context Protocol tools for AI agents
- **Export Targets** — Unity, Unreal Engine, Web, 3D Print presets

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | React 19, TypeScript, Vite 6 |
| 3D Engine | Three.js, @react-three/fiber 9, @react-three/drei 10 |
| CAD Kernel | Replicad (OpenCASCADE WASM) |
| State | Zustand (with persist middleware for settings) |
| Routing | TanStack Router (file-based) |
| Data | TanStack React Query |
| Editor | Monaco Editor |
| LLM | OpenAI / Anthropic Claude / Ollama (runtime-configurable) |
| Auth | Azure AD (MSAL) — optional, install separately |
| Styling | Tailwind CSS |

## Quick Start

```bash
# Clone
git clone https://github.com/vespo92/AI-CAD.git
cd AI-CAD

# Install dependencies (Node 22+ required)
npm install

# Copy environment config
cp .env.example .env

# Start dev server
npm run dev
```

Open http://localhost:5176

The app runs in **offline mode** by default — you can write Replicad code in the editor and see 3D models without any backend services. To enable AI chat features, either:
- Set `VITE_LLM_API_KEY` in `.env`, or
- Configure your LLM provider at runtime via **Settings** (gear icon in toolbar)

## Architecture

```
src/
  components/
    viewport/       # 3D rendering (Three.js canvas)
    chat/           # LLM chat interface
    editor/         # Monaco code editor
    feature-tree/   # Parametric feature tree (drives code generation)
    parts/          # Parts library browser
    assembly/       # Assembly management
    convert/        # Format conversion
    sketch/         # 2D sketch editor
  lib/
    cad-engine/     # Web Worker CAD execution + feature codegen
    api/            # HTTP clients (LLM, CAD service, UPC)
    mcp/            # Model Context Protocol server
    store/          # Zustand state management (cad, console, llm)
    auth/           # Azure AD (optional stub)
  routes/           # TanStack file-based routes
  types/            # TypeScript type definitions
```

## CAD Engine

The CAD kernel runs in a Web Worker using Replicad (a TypeScript wrapper around OpenCASCADE compiled to WASM). This keeps the UI responsive during expensive geometry operations.

```typescript
// Example: Create a box with a fillet
const shape = drawRoundedRectangle(40, 30, 5)
  .sketchOnPlane("XY")
  .extrude(15)
  .fillet(2, (e) => e.inDirection("Z"));

return shape;
```

## Feature-Based Modeling

Click the **+** button in the Feature Tree panel to add parametric features. Each feature maps to generated Replicad code. Toggling visibility or deleting features automatically regenerates and re-executes the model.

Supported features: Sketch, Extrude, Revolve, Fillet, Chamfer, Shell, Boolean Cut/Fuse, Mirror, Pattern.

## MCP Server

AI-CAD exposes its capabilities as an MCP server, allowing any AI agent to create and manipulate CAD models:

```bash
# Run standalone MCP server
npm run mcp:server
```

Available tools: `execute_code`, `create_primitive`, `modify_shape`, `export_model`, `import_model`, `describe_model`, `send_to_external`

## Docker

```bash
# Build
docker build -t ai-cad .

# Run
docker run -p 8080:80 ai-cad
```

For production with backend services, pass build args:

```bash
docker build \
  --build-arg VITE_LLM_GATEWAY_URL=https://your-llm-gateway.example.com \
  --build-arg VITE_CAD_SERVICE_URL=https://your-cad-service.example.com \
  -t ai-cad .
```

## Backend Services (Optional)

AI-CAD's core modeling works standalone. For the full pipeline, you can run these companion services:

| Service | Purpose | Default Port |
|---------|---------|-------------|
| LLM Gateway | Proxies LLM requests (OpenAI/Anthropic/Ollama) | 8092 |
| CAD Service | Format conversion engine (FreeCAD/OpenSCAD) | 8090 |
| File Proxy | File upload/download storage | 8091 |
| UPC | Universal Parts Consciousness database | 8093 |

## License

MIT
