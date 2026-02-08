# Graphics Rendering Guide

[← Back to Navigation Guide](./NAVIGATING.md) | [Contributing Guide](./CONTRIBUTING.md)

This guide explains how graphics rendering works in Infinite Chess and how to add new visuals to the board. Since the board is infinite, the rendering system has a few unique considerations compared to typical 2D games.

## Coordinate Spaces

There are two main coordinate spaces you'll work with:

### Grid Space (Unit / Tile / Coord Space)

Grid space uses integer coordinates where each unit is one chess square. The coordinate `[3, 5]` refers to the square at column 3, row 5 on the chessboard. This is the space most game logic operates in—piece positions, legal moves, and board boundaries are all expressed in grid coordinates.

### World Space

World space is the coordinate system the GPU and camera see. It depends on the board's current position and zoom level (scale). As the player pans and zooms, the same grid square maps to different world-space coordinates. The camera itself is fixed at `[0, 0, 12]` in 3D space, looking down; it is the **board** that moves and scales beneath it.

### Converting Between Spaces

[`space.ts`](../src/client/scripts/esm/game/misc/space.ts) provides the key conversion functions:

- `convertCoordToWorldSpace(coords)` — Grid → World. Accounts for the square's center offset, board position, and scale.
- `convertWorldSpaceToCoords(worldCoords)` — World → Grid (floating-point result).
- `convertWorldSpaceToCoords_Rounded(worldCoords)` — World → Grid, rounded to the nearest integer tile.
- `convertWorldSpaceToGrid(value)` — Divides a single world-space value by the current board scale.

[`mouse.ts`](../src/client/scripts/esm/game/misc/mouse.ts) builds on these to give you the pointer position in either space:

- `getMouseWorld()` — Mouse position in world space.
- `getTileMouseOver_Float()` — Mouse position as a floating-point grid coordinate.
- `getTileMouseOver_Integer()` — Mouse position snapped to the integer tile it hovers over.

## Screen Bounding Boxes

Since the board is infinite, you often need to know what region of it is currently visible.

**In world space**, [`camera.ts`](../src/client/scripts/esm/game/rendering/camera.ts) provides:

- `getScreenBoundingBox()` — Returns `{ left, right, bottom, top }` in world-space units, representing the visible screen edges. Accepts an optional debug-mode flag and padding.
- `getRespectiveScreenBox()` — Same idea, but adapts for perspective mode.

**In grid space**, [`boardtiles.ts`](../src/client/scripts/esm/game/rendering/boardtiles.ts) provides:

- `getBoundingBoxOfBoard()` — Visible region as a floating-point bounding box in grid coordinates.
- `gboundingBox()` — Visible region as an integer bounding box, rounded outward so every partially-visible tile is included.

## Creating Vertex Data

All geometry rendered to the screen starts as an array of vertex data. Each vertex contains its attributes packed sequentially—position components first, then optionally color and/or texture coordinates.

### Primitives

[`primitives.ts`](../src/client/scripts/esm/game/rendering/primitives.ts) has ready-made helpers for common shapes:

| Function                                                        | Produces                | Stride | Use Case                  |
| --------------------------------------------------------------- | ----------------------- | ------ | ------------------------- |
| `Quad_Color(left, bottom, right, top, color)`                   | 2D quad, solid color    | 6      | Colored rectangles, masks |
| `Quad_Color3D(left, bottom, right, top, z, color)`              | 3D quad, solid color    | 7      | Depth-layered rectangles  |
| `Quad_Texture(left, bottom, right, top, texCoords)`             | 2D quad, textured       | 4      | Sprite/image rendering    |
| `Quad_ColorTexture(left, bottom, right, top, texCoords, color)` | 2D quad, tinted texture | 8      | Tinted sprites            |
| `Circle(centerX, centerY, radius, resolution, color)`           | 2D circle               | 6      | Circular indicators       |
| `Rect(left, bottom, right, top, color)`                         | Line-loop rectangle     | 6      | Outlines, debug boxes     |

**Stride** is the total number of components per vertex. For example, a 2D position `(x, y)` plus an RGBA color `(r, g, b, a)` yields a stride of 6.

### Mesh Helpers

[`meshes.ts`](../src/client/scripts/esm/game/rendering/meshes.ts) provides higher-level helpers that automatically apply board transformations:

- `QuadWorld_Color(coords, color)` — Takes a grid coordinate and returns world-space vertex data for a colored tile highlight.
- `QuadWorld_ColorTexture(coords, type, color)` — Same, but with texture coordinates for a piece sprite.
- `getCoordBoxWorld(coords)` — Returns the world-space bounding box `{ left, right, bottom, top }` for a given grid square.
- `applyWorldTransformationsToBoundingBox(box)` — Applies the current board position and scale to a bounding box.
- `expandTileBoundingBoxToEncompassWholeSquare(box)` — Expands an integer bounding box by 0.5 in each direction so it covers the full visual area of the edge tiles.

## Rendering with `createRenderable()`

Once you have vertex data, pass it to [`createRenderable()`](../src/client/scripts/esm/webgl/Renderable.ts) to create a GPU-ready object:

```ts
import { createRenderable } from '../../webgl/Renderable.js';

const vertexData = primitives.Quad_Color(left, bottom, right, top, [1, 0, 0, 1]);
const renderable = createRenderable(vertexData, 2, 'TRIANGLES', 'color', true);
renderable.render();
```

**Parameters:**

| Parameter               | Description                                                                        |
| ----------------------- | ---------------------------------------------------------------------------------- |
| `data`                  | Vertex data array (number[] or TypedArray)                                         |
| `numPositionComponents` | `2` for 2D (x, y) or `3` for 3D (x, y, z)                                          |
| `mode`                  | Drawing primitive: `'TRIANGLES'`, `'LINES'`, `'LINE_LOOP'`, `'TRIANGLE_FAN'`, etc. |
| `shader`                | Name of the shader program to use (see below)                                      |
| `usingColor`            | `true` if vertex data includes RGBA color components                               |
| `texture`               | Optional WebGLTexture for textured shaders                                         |

The returned `Renderable` object has:

- `.render(position?, scale?, uniforms?)` — Draws the geometry. Optional position/scale override the board transforms. Custom uniforms can be passed as an object.
- `.data` — Direct reference to the vertex buffer data. You can modify this and call `.updateBufferIndices(start, count)` to efficiently push changes to the GPU without recreating the buffer.

## Commonly Used Shaders

| Shader Name      | Vertex Format        | Stride (2D) | When to Use                                                              |
| ---------------- | -------------------- | ----------- | ------------------------------------------------------------------------ |
| `'color'`        | position + RGBA      | 6           | Solid colored shapes: highlights, masks, outlines, debug visuals         |
| `'texture'`      | position + UV        | 4           | Textured quads without tinting                                           |
| `'colorTexture'` | position + UV + RGBA | 8           | Textured quads with per-vertex color tinting (e.g., pieces on the board) |

For 3D positions, add 1 to each stride (e.g., `'color'` with 3D = stride 7). The position components always come first, followed by texture coordinates (if used), then color (if used).

## Clamping to Screen Edges

Because the board is infinite, world-space coordinates can grow arbitrarily large. Passing extreme floating-point values as vertex data to the GPU causes visual glitches. **You must clamp your vertex coordinates to the visible screen area.**

[`border.ts`](../src/client/scripts/esm/game/rendering/border.ts) demonstrates this pattern:

```ts
const screenBox = camera.getRespectiveScreenBox();

// Cap world-space coordinates to the screen edges
if (worldBox.left < screenBox.left) worldBox.left = screenBox.left;
if (worldBox.right > screenBox.right) worldBox.right = screenBox.right;
if (worldBox.bottom < screenBox.bottom) worldBox.bottom = screenBox.bottom;
if (worldBox.top > screenBox.top) worldBox.top = screenBox.top;
```

**When do you need to clamp?** Any time your geometry could extend far beyond the screen—for instance, a line stretching to the edge of the playable region, or a filled rectangle covering a large board area. Geometry that only covers a single tile or a small cluster of tiles near the camera typically does not need clamping.

## Integrating Into the Render Loop

The render loop lives in `game.ts`. The `renderScene()` function calls each renderer in a specific order:

1. **Background** — Starfield / void rendering (via stencil masking)
2. **Board** — Tile grid, promotion lines, masked to the playable region
3. **Below-piece overlays** — Highlights, check indicators, legal move dots
4. **Pieces** — All piece sprites
5. **Above-piece overlays** — Arrows, animations, annotations, crosshair

To add a new renderer:

1. **Create a module** in `src/client/scripts/esm/game/rendering/` with a `render()` function.
2. **Import it** in `game.ts`.
3. **Call your `render()` function** at the appropriate point in `renderScene()`, depending on whether your visual should appear below or above pieces.

If your graphic needs to update every frame (e.g., it depends on camera position), regenerate or update vertex data inside your `render()` function. For static geometry, create the `Renderable` once and simply call `.render()` each frame.

## Putting It All Together: Example Workflow

Here is a condensed example of how you might render a colored rectangle on the board at grid coordinates `[10, 20]` to `[15, 25]`:

```ts
import camera from './camera.js';
import meshes from './meshes.js';
import primitives from './primitives.js';
import { createRenderable } from '../../webgl/Renderable.js';

function render() {
	// 1. Define bounds in grid space
	const gridBox = { left: 10n, right: 15n, bottom: 20n, top: 25n };

	// 2. Expand to cover full tiles and convert to world space
	const expanded = meshes.expandTileBoundingBoxToEncompassWholeSquare(gridBox);
	const worldBox = meshes.applyWorldTransformationsToBoundingBox(expanded);

	// 3. Clamp to screen edges to prevent float overflow
	const screenBox = camera.getRespectiveScreenBox();
	if (worldBox.left < screenBox.left) worldBox.left = screenBox.left;
	if (worldBox.right > screenBox.right) worldBox.right = screenBox.right;
	if (worldBox.bottom < screenBox.bottom) worldBox.bottom = screenBox.bottom;
	if (worldBox.top > screenBox.top) worldBox.top = screenBox.top;

	// 4. Build vertex data and render
	const color = [0.2, 0.6, 1.0, 0.5]; // Semi-transparent blue
	const vertexData = primitives.Quad_Color(
		worldBox.left,
		worldBox.bottom,
		worldBox.right,
		worldBox.top,
		color,
	);
	createRenderable(vertexData, 2, 'TRIANGLES', 'color', true).render();
}
```

This covers the core workflow: define geometry in grid space, transform to world space, clamp to the screen, generate vertex data, and render. For more advanced needs—custom shaders, instanced rendering, or post-processing effects—study the existing renderers in the `rendering/` directory as reference implementations.
