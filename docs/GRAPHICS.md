# Graphics Rendering Guide

[← Back to Navigation Guide](./NAVIGATING.md) | [Contributing Guide](./GUIDELINES.md)

This guide explains how graphics rendering works on the board, and how to add new visuals. An infinite board provides a few unique considerations to the rendering system than typical 2D games.

All visuals are rendered with raw WebGL for maximum control. No external libraries are used, like for example Three.js.

## Coordinate Spaces

There are two coordinate spaces to know of:

### Grid Space (Coord/Model Space)

Grid space uses integer coordinates where each unit is one chess square. The origin of a square is its center, so the coordinate `[3n, 5n]` refers to the middle of the square at (3,5). Piece rendering uses this coordinate space, including square highlights.

When decimal precision is needed on top of BigInts (like knowing, for example, the exact coordinate the edges of the screen are at) we use **BigDecimals** from `@naviary/bigdecimal`, a custom designed number package that adds decimal precision to arbitrarily large coordinates. The package provides fully type safe arithmetic methods for working with them when needed.

The bounding box of the screen over the grid space can be retrieved with `boardtiles.gboundingBoxFloat()` (decimal precision) or `boardtiles.gboundingBox()` (rounded away from screen center to next integer coordinates).

### World Space

World space is the coordinate system the GPU and camera use. The camera is fixed at `[0, 0, 12]` at all times, looking straight down at the board, while the board moves and scales underneath it. The board spans the entire X/Y plane, and the Z axis is away from the board (or up when in perspective mode). This is the final coordinate space all vertex data is converted to before rendering.

The center of the screen is always `[0, 0]` in world space. The bounding box of the screen can be retrieved with `camera.getRespectiveScreenBox()`, which automatically expands the box to the horizon when in perspective mode. Panning/zooming the board has no effect on this box's coordinates, only resizing the window does. The horizon is `1500` (chebyshev) world space units away from the center of the screen, anything beyond that gets clipped. For this reason, arbitrarily large grid-space coordinates _always_ have to be converted to world space before rendering, and clamped to that range, to prevent visual artifacts.

### Converting Between Spaces

[`space.ts`](../src/client/scripts/esm/game/misc/space.ts) provides key conversion functions for converting from one coordinate space to the other.

- `convertCoordToWorldSpace(coords)` — Grid → World. You may first have to cast BigInt coords to BigDecimal coords via `bdcoords.FromCoords(coords)`.
- `convertWorldSpaceToCoords(worldCoords)` — World → Grid (includes decimal precision).
- `convertWorldSpaceToCoords_Rounded(worldCoords)` — World → Grid, returning the integer tile coordinates the world space position is over.

[`mouse.ts`](../src/client/scripts/esm/game/misc/mouse.ts) can be used to locate the mouse position in either coordinate space.

- `getMouseWorld()` — Mouse position in world space.
- `getTileMouseOver_Float()` — Mouse position in grid space (with decimal precision).
- `getTileMouseOver_Integer()` — Mouse position in grid space, returning the integer tile coordinates the mouse is over.

## Creating Vertex Data

All geometry rendered to the screen starts as an array of vertex data. Each vertex contains its attributes packed sequentially—position components first, then optionally color and/or texture coordinates. So for example, the vertex data of a red line from (-1,0) to (1,0) would be:

```ts
// prettier-ignore
const vertexData = [
	// x, y,   r, g, b, a
	  -1, 0,   1, 0, 0, 1, // Vertex 1
	   1, 0,   1, 0, 0, 1, // Vertex 2
];
```

The exact attributes you include in the vertex data depends on the shader you plan on rendering your object with, and whether you're using instanced rendering. More info below.

### Primitives

[`primitives.ts`](../src/client/scripts/esm/game/rendering/primitives.ts) provides many helpers for calculating the vertex data of various shapes: squares, rectangles, circles, etc. from just their dimensions and color.

### Instanced Shape Data

[`instancedshapes.ts`](../src/client/scripts/esm/game/rendering/instancedshapes.ts), if you're using instanced rendering (which is a lot simpler to create vertex & instance data for, if you're rendering many copies of the same shape), provides helpers for obtaining the vertex data of the shape you want to render: legal move square, dot, special rights plus sign, etc.

If you use instanced rendering, you bypass the need to calculate instance-specific vertex data, often only needing to specify the position offset of each of your objects in the instance data. This is used by piece rendering inside [`piecemodels.ts`](../src/client/scripts/esm/game/rendering/piecemodels.ts) (that example renders textures), and by legal move model generation inside [`legalmovemodel.ts`](../src/client/scripts/esm/game/rendering/highlights/legalmovemodel.ts).

### Mesh Helpers

[`meshes.ts`](../src/client/scripts/esm/game/rendering/meshes.ts) provides higher-level helpers for automatically generating the vertex data for you if all you have is the integer coordinate and color of the square you want vertex data for. It can also convert a grid space bounding box into world space for you.

### Square Highlights

For the common task of highlighting squares on the board, [`squarerendering.genModel()`](../src/client/scripts/esm/game/rendering/highlights/squarerendering.ts) is high-level helper that internally handles the vertex data and instance data creation for you from just a list of integer coordinates and a color, returning a ready-to-render object.

## Rendering Vertex Data

Once you have vertex data, pass it to [`createRenderable()`](../src/client/scripts/esm/webgl/Renderable.ts) or [`createRenderable_Instanced()`](../src/client/scripts/esm/webgl/Renderable.ts)
to create a GPU-ready object that can instantly be rendered.

They accept arguments for vertex data, instance data (if using instanced rendering), information on how you packed your vertex data with the position & color attributes, the drawing mode to use ('TRIANGLES', 'LINES', etc.), and the name of the shader you want to use (see options below).

The returned `Renderable` object has a `render()` property for instantly rendering it. If you generated your vertex data in world space, you don't have to specify transformation arguments when rendering for the item to appear in the correct place. If however your vertex data is in grid space (which is common for instance rendering), you should provide the `position` and `scale` arguments when rendering. Position is dependent on the board position (`meshes.getModelPosition()`), and scale is dependant on the board scale (`boardpos.getBoardScaleAsNumber()`). The render method uses these to automatically transform the points to world space when rendering.

The `Renderable` object also has properties for updating its vertex/instance data internally, allowing you the option to skip generating a whole new Renderable every single frame. This is optimal when you have arbitrarily many objects to render, and their positions change infrequently. [`piecemodels.ts`](../src/client/scripts/esm/game/rendering/piecemodels.ts) for example does this when updating the model of the piece sprites.

## Shader Picking

Different shaders are compatible with different ways of packing vertex data. Some are compatible with rendering colored vertices, some with textured vertices, and another with both. There are many shaders the game uses, many custom made for specific object rendering, but here are the most common we use:

| Shader Name          | Vertex Data Packing       | Instance Data Packing | When to Use                                  |
| -------------------- | ------------------------- | --------------------- | -------------------------------------------- |
| `'color'`            | position + color          | -                     | Solid colored shapes                         |
| `'colorInstanced'`   | position + color          | position              | Solid colored shapes via instanced rendering |
| `'texture'`          | position + texture coords | -                     | Textured shapes                              |
| `'textureInstanced'` | position + texture coords | position              | Textured shapes with via instanced rendering |

Other shaders can allow for more unique properties for each instance, such as `'arrows'` for the indicator arrows rendering, which allows a unique position, color (for opacity), and rotation, per arrow instance, or `'starfield'` which allows a unique position, color, and size, for each animated star. For a full list of available shaders and their compatible vertex data packing, see [`ProgramManager.ts`](../src/client/scripts/esm/webgl/ProgramManager.ts).

## Integrating Into the Render Loop

The render loop lives in `gamecore.ts`. The `renderScene()` function renders all items in the order:

1. **Background** — Starfield / void rendering (uses masking)
2. **Board** — Infinite tile grid, promotion lines
3. **Below-piece overlays** — Square highlights, rays, check indicators, legal move highlights
4. **Pieces** — All piece sprites
5. **Above-piece overlays** — Arrows, animations, crosshair

Call your script's render method in the appropriate section.

## Rendering Architecture: Render Contexts

The game can draw two independent boards at the same time: the interactive game, and the small board inside the variant-preview hover tooltip ([`variantPreviewTooltip.ts`](../src/client/scripts/esm/game/rendering/variantPreviewTooltip.ts)). Each lives on its own `<canvas>`, so each needs its own WebGL context — and WebGL objects (shader programs, textures, buffers/VAOs) can **never** be shared across contexts.

A [`RenderContext`](../src/client/scripts/esm/game/rendering/RenderContext.ts) bundles everything bound to one canvas: its `gl` context, `ProgramManager`, `camera`, `boardpos` (position/scale), piece `textures`, stencil `maskedDraw`, tile renderer (`boardtiles`), and a `renderable` factory for creating models in that context. The interactive game builds one in `gamecore.init()`; the preview builds its own in `ensureGLReady()`. Shared drawing code is handed a `RenderContext` and draws for whichever board it's told, instead of reaching for a process-wide singleton.

### Choosing a shape for a new render module

When you add a rendering script, pick one of these based on what state it owns and who calls it:

| Pattern                      | Use when                                                                                                                                                             | How                                                                                                                                                                                                  | Examples                                                                       |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| **Factory** (+ game default) | The module owns context- or view-bound state: GPU objects (textures, programs) or the view (camera matrices, board position). Two boards genuinely need two copies.  | Export a `createX()` that builds one instance. Expose the interactive game's instance as the module default so existing `x.foo()` callers stay unchanged; the preview calls `createX()` for its own. | camera, boardpos, texturecache, maskedDraw, Renderable, boardtiles             |
| **Thread `ctx`**             | Shared draw logic that BOTH boards run, needing the whole GPU bundle (gl + programs + textures + masker + tiles). Redundancy rules forbid giving the preview a copy. | Take `ctx: RenderContext` as the first parameter. This forces the game's callers (`renderScene`) to pass `gameContext`.                                                                              | piecemodels, border, promotionlines, miniimagerenderer                         |
| **Sub-part w/ game default** | Shared helper that needs only ONE piece of context (just the camera, or just boardpos), not the whole bundle.                                                        | Take that piece as a parameter defaulting to the game singleton: `cam: Camera = camera`. Game callers omit it; the preview passes `ctx.camera`.                                                      | area, meshes                                                                   |
| **Stay a singleton**         | Game-only rendering the preview never uses, OR pure math derived from the interactive game.                                                                          | Read the game's default exports directly. No `ctx` needed — there is only ever one caller.                                                                                                           | highlights, coordinates, starfield, arrows, selection, snapping, boardgeometry |
| **Unchanged** (context-free) | Holds no context/view state at all — decoded bitmaps, SVGs, pure math. Already shareable across contexts.                                                            | Leave as-is.                                                                                                                                                                                         | imagecache, svgcache                                                           |

Two wiring notes for the factory pattern:

- Modules whose game instance needs no `gl` (camera, boardpos, texturecache) build it at module load: `export default createX(...)`.
- Modules that need `gl`/`ProgramManager` (which exist only after WebGL boots) hold a `let gameInstance` set by a runtime `init()`, and their free exports delegate to it (maskedDraw, Renderable). This keeps game-only callers writing `maskedDraw.execute(...)` unchanged.

Rule of thumb: **only make something a factory if two boards genuinely need two of it.** Otherwise leave it a singleton reading the game's context, or thread `ctx` if the preview must share the exact same drawing code.

## Conclusion

Ultimately, always refer to how the existing code renders objects for inspiration for rendering your own!
