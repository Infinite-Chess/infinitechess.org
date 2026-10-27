# Graphics Rendering Guide

This guide explains how graphics rendering works on the board, and how to add new visuals. An
infinite board provides a few unique considerations to the rendering system than typical 2D games.

All visuals are rendered with raw WebGL for maximum control. No external libraries are used, like
for example Three.js.

## Coordinate Spaces

There are two coordinate spaces to know of:

### Grid Space (Coord/Model Space)

Grid space uses integer coordinates where each unit is one chess square. The origin of a square is
its center, so the coordinate `[3n, 5n]` refers to the middle of the square at (3,5). Piece
rendering uses this coordinate space, including square highlights.

When decimal precision is needed on top of BigInts (like knowing, for example, the exact coordinate
the edges of the screen are at) we use **BigDecimals** from `@naviary/bigdecimal`, a custom designed
number package that adds decimal precision to arbitrarily large coordinates. The package provides
fully type safe arithmetic methods for working with them when needed.

The interactive game's bounding box of the screen over the grid space can be retrieved with
`boardview.gboundingBoxFloat()` (decimal precision) or `boardview.gboundingBox()` (rounded away from
screen center to next integer coordinates). Any other board computes its own with
`boardgeometry.getBoundingBoxOfBoard()`.

### World Space

World space is the coordinate system the GPU and camera use. The camera is fixed at `[0, 0, 12]` at
all times, looking straight down at the board, while the board moves and scales underneath it. The
board spans the entire X/Y plane, and the Z axis is away from the board (or up when in perspective
mode). This is the final coordinate space all vertex data is converted to before rendering.

The center of the screen is always `[0, 0]` in world space. The bounding box of the screen can be
retrieved with `camera.getRespectiveScreenBox()`, which automatically expands the box to the horizon
when in perspective mode. Panning/zooming the board has no effect on this box's coordinates, only
resizing the window does. The horizon is `1500` (chebyshev) world space units away from the center
of the screen, anything beyond that gets clipped. For this reason, arbitrarily large grid-space
coordinates _always_ have to be converted to world space before rendering, and clamped to that
range, to prevent visual artifacts.

### Converting Between Spaces

[`space.ts`](/src/client/scripts/board/rendering/space.ts) provides key conversion functions for
converting from one coordinate space to the other.

- `convertCoordToWorldSpace(coords, position, scale)` — Grid → World, given a board's position and
  scale. You may first have to cast BigInt coords to BigDecimal coords via
  `bdcoords.fromCoords(coords)`.
- `convertWorldSpaceToCoords(boardpos, worldCoords)` — World → Grid (includes decimal precision).
- `convertWorldSpaceToCoords_Rounded(boardpos, worldCoords)` — World → Grid, returning the integer
  tile coordinates the world space position is over.

[`mouse.ts`](/src/client/scripts/game/mouse.ts) can be used to locate the mouse position in either
coordinate space.

- `getMouseWorld()` — Mouse position in world space.
- `getTileMouseOver_Integer()` — Mouse position in grid space, returning the integer tile
  coordinates the mouse is over.

## Creating Vertex Data

All geometry rendered to the screen starts as an array of vertex data. Each vertex contains its
attributes packed sequentially—position components first, then optionally color and/or texture
coordinates. So for example, the vertex data of a red line from (-1,0) to (1,0) would be:

```ts
// prettier-ignore
const vertexData = [
	// x, y,   r, g, b, a
	  -1, 0,   1, 0, 0, 1, // Vertex 1
	   1, 0,   1, 0, 0, 1, // Vertex 2
];
```

The exact attributes you include in the vertex data depends on the shader you plan on rendering your
object with, and whether you're using instanced rendering. More info below.

### Primitives

[`primitives.ts`](/src/client/scripts/board/rendering/primitives.ts) provides many helpers for
calculating the vertex data of various shapes: squares, rectangles, circles, etc. from just their
dimensions and color.

### Instanced Shape Data

[`instancedshapes.ts`](/src/client/scripts/board/rendering/instancedshapes.ts), if you're using
instanced rendering (which is a lot simpler to create vertex & instance data for, if you're
rendering many copies of the same shape), provides helpers for obtaining the vertex data of the
shape you want to render: legal move square, dot, special rights plus sign, etc.

If you use instanced rendering, you bypass the need to calculate instance-specific vertex data,
often only needing to specify the position offset of each of your objects in the instance data. This
is used by piece rendering inside
[`piecemodels.ts`](/src/client/scripts/board/rendering/piecemodels.ts) (that example renders
textures), and by legal move model generation inside
[`legalmovemodel.ts`](/src/client/scripts/game/rendering/highlights/legalmovemodel.ts).

### Mesh Helpers

[`meshes.ts`](/src/client/scripts/board/rendering/meshes.ts) provides higher-level helpers for
automatically generating the vertex data for you if all you have is the integer coordinate and color
of the square you want vertex data for. It can also convert a grid space bounding box into world
space for you.

### Square Highlights

For the common task of highlighting squares on the board,
[`squarerendering.genModel()`](/src/client/scripts/board/rendering/squarerendering.ts) is high-level
helper that internally handles the vertex data and instance data creation for you from just a list
of integer coordinates and a color, returning a ready-to-render object.

## Rendering Vertex Data

Once you have vertex data, pass it to
[`createRenderable()`](/src/client/scripts/game/rendering/gamerenderable.ts) or
[`createRenderable_Instanced()`](/src/client/scripts/game/rendering/gamerenderable.ts) to create an
object that can instantly be rendered.

They accept arguments for vertex data, instance data (if using instanced rendering), information on
how you packed your vertex data with the position & color attributes, the drawing mode to use
('TRIANGLES', 'LINES', etc.), and the name of the shader you want to use (see options below).

The returned `Renderable` object has a `render()` property for instantly rendering it. If you
generated your vertex data in world space, you don't have to specify transformation arguments when
rendering for the item to appear in the correct place. If however your vertex data is in grid space
(which is common for instance rendering), you should provide the `position` and `scale` arguments
when rendering, both from `meshes.getBoardRenderTransform()`, which derives them from the board's
position and scale. The render method uses these to automatically transform the points to world
space when rendering.

A `Renderable` is meant to be rendered the frame it's built; it reuses the context's buffers rather
than creating new ones. A model kept across frames uses the matching `createPersistentRenderable*()`
instead, which takes the same arguments and returns a `PersistentRenderable` owning its GPU buffers:
update its vertex or instance data in place instead of rebuilding it, as
[`piecemodels.ts`](/src/client/scripts/board/rendering/piecemodels.ts) does for the piece sprites,
and call its `dispose()` before replacing or dropping it.

## Shader Picking

Different shaders are compatible with different ways of packing vertex data. Some are compatible
with rendering colored vertices, some with textured vertices, and another with both. There are many
shaders the game uses, many custom made for specific object rendering, but here are the most common
we use:

| Shader Name          | Vertex Data Packing       | Instance Data Packing | When to Use                                  |
| -------------------- | ------------------------- | --------------------- | -------------------------------------------- |
| `'color'`            | position + color          | -                     | Solid colored shapes                         |
| `'colorInstanced'`   | position + color          | position              | Solid colored shapes via instanced rendering |
| `'texture'`          | position + texture coords | -                     | Textured shapes                              |
| `'textureInstanced'` | position + texture coords | position              | Textured shapes with via instanced rendering |

Other shaders can allow for more unique properties for each instance, such as `'arrows'` for the
indicator arrows rendering, which allows a unique position, color (for opacity), and rotation, per
arrow instance, or `'starfield'` which allows a unique position, color, and size, for each animated
star. For a full list of available shaders, see
[`ProgramManager.ts`](/src/client/scripts/webgl/ProgramManager.ts); each declares its vertex data
packing in its GLSL.

## Integrating Into the Render Loop

The frame is driven by [`gameloop.ts`](/src/client/scripts/game/gameloop.ts), which updates every
game module in order and then calls the scene. The drawing itself lives in
[`gamescene.ts`](/src/client/scripts/game/rendering/gamescene.ts), whose `renderScene()` function
renders all items in the order:

1. **Background** — Starfield / void rendering (uses masking)
2. **Board** — Infinite tile grid, promotion lines
3. **Below-piece overlays** — Square highlights, rays, check indicators, legal move highlights
4. **Pieces** — All piece sprites
5. **Above-piece overlays** — Arrows, animations, crosshair

Call your script's render method in the appropriate section. A visual only one page draws goes in
that page's own overlays module instead (e.g.
[`analysisoverlays.ts`](/src/client/scripts/views/analysis/rendering/analysisoverlays.ts)), which
draws through `GameBus`'s `render-below-pieces` / `render-above-pieces` hooks.

## Rendering Architecture: Render Contexts

The game can draw independent boards at the same time: the interactive game, static previews (the
small board inside the variant-preview hover tooltip
([`variantpreviewtooltip.ts`](/src/client/scripts/board/variantselector/variantpreviewtooltip.ts))
and the challenge page's board
([`challengepreview.ts`](/src/client/scripts/views/challenge/challengepreview.ts))), and the home
page's featured live games
([`featuredboard.ts`](/src/client/scripts/views/index/featured/featuredboard.ts)). Each lives on its
own `<canvas>`, so each needs its own WebGL context — and WebGL objects (shader programs, textures,
buffers/VAOs) can **never** be shared across contexts.

A [`RenderContext`](/src/client/scripts/board/rendering/RenderContext.ts) bundles everything bound
to one canvas: its `gl` context, `ProgramManager`, `camera`, `boardpos` (position/scale), piece
`textures`, stencil `maskedDraw`, `frames` tracker (whether it needs a redraw), tile renderer
(`boardtiles`), and a `renderable` factory for creating models in that context. Every board outside
the interactive game assembles its parts with
[`standaloneboard.ts`](/src/client/scripts/board/rendering/standaloneboard.ts), which also draws the
layers they share. Shared drawing code is handed a `RenderContext` and draws for whichever board
it's told, instead of reaching for a process-wide singleton. A board that comes and goes calls
`dispose()`, as browsers cap how many WebGL contexts stay alive.

A board that plays a game out is a [`LiveBoard`](/src/client/scripts/board/rendering/LiveBoard.ts):
a `RenderContext` that also holds its piece animations, arrow indicators, water ripples, and
post-processing pipeline. The interactive game builds one in `gamescene.init()`, and the home page
one per featured game. Live-board modules (animation, arrows, ripples, move effects) hold no state
of their own and take the board they act on.

### Choosing a shape for a new render module

When you add a rendering script, pick one of these based on what state it owns and who calls it:

| Pattern                      | Use when                                                                                                                                                               | How                                                                                                                                                                                                        | Examples                                                                  |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| **Factory** (+ game default) | The module owns context- or view-bound state: GPU objects (textures, programs) or the view (camera matrices, board position). Two boards genuinely need two copies.    | Export a `createX()` that builds one instance. Expose the interactive game's instance as the module default so existing `x.foo()` callers stay unchanged; every other board calls `createX()` for its own. | camera, boardpos, texturecache, maskeddraw, renderable, boardtiles        |
| **Thread `ctx`**             | Shared draw logic that several boards run, needing the whole GPU bundle (gl + programs + textures + masker + tiles). Redundancy rules forbid giving each board a copy. | Take `ctx: RenderContext` (or `board: LiveBoard`) as the first parameter. This forces the game's callers (`renderScene`) to pass `gameContext`.                                                            | piecemodels, border, promotionlines, miniimagerenderer, animation, arrows |
| **Sub-part**                 | Shared helper that needs only ONE piece of context (just the camera, or just boardpos), not the whole bundle.                                                          | Take that piece as a required first parameter. Game callers pass the game's `camera`/`boardpos`; other boards pass `ctx.camera`. Never default it: a forgotten argument would draw with the game's board.  | area, meshes, space, boardgeometry                                        |
| **Stay a singleton**         | Game-only rendering no other board uses, OR pure math derived from the interactive game.                                                                               | Read the game's default exports directly. No `ctx` needed — there is only ever one caller.                                                                                                                 | highlights, coordinates, starfield, selection, snapping, boardview        |
| **Unchanged** (context-free) | Holds no context/view state at all — decoded bitmaps, SVGs, pure math. Already shareable across contexts.                                                              | Leave as-is.                                                                                                                                                                                               | imagecache, svgcache                                                      |

Wiring notes for the factory pattern:

- Modules whose game instance needs no `gl` (camera, boardpos, texturecache) build it at module
  load: `export default createX(...)`.
- Modules whose game instance only exists after WebGL boots hold it in a `let` set by a runtime
  `init()`, and their free exports delegate to it (maskeddraw, gamerenderable). This keeps game-only
  callers writing `maskeddraw.execute(...)` unchanged. Either way the game ends up with exactly ONE
  instance, but the two are wired opposite: `maskeddraw.init()` builds the masker for
  `RenderContext` to take, while `RenderContext` builds the renderable factory for
  `gamerenderable.init()` to take.
- The generic `createRenderableFactory` and the model types live in
  [`webgl/Renderable.ts`](/src/client/scripts/webgl/Renderable.ts); the game's free create-functions
  live in
  [`game/rendering/gamerenderable.ts`](/src/client/scripts/game/rendering/gamerenderable.ts).

Rule of thumb: **only make something a factory if two boards genuinely need two of it.** Otherwise
leave it a singleton reading the game's context, or thread `ctx` if another board must share the
exact same drawing code.

## Conclusion

Ultimately, always refer to how the existing code renders objects for inspiration for rendering your
own!
