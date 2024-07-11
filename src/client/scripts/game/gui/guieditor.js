/**
 * This script manages the editor
 */

"use strict";

const guieditor = (function () {
  const element_editor = document.getElementById("editor");
  const element_editorBoard = document.getElementById("editor-board");
  const element_editorSidebar = document.getElementById("editor-sidebar");
  const main = document.querySelector("main");
  const editorCtx = element_editorBoard.getContext("2d");

  // stores the currently placed pieces and their states in the editor
  const placedPieces = new Map();

  // the zoom of the editor, from .01 to Infinity
  const editorBoardZoom = 0.01;
  // The position of the top-left corner of screen
  let editorBoardPositionX = 0;
  let editorBoardPositionY = 0;

  function drawCheckerboard() {
    let windowWidth = editorCtx.canvas.width;
    let windowHeight = editorCtx.canvas.width;
    let boardTileSideLength = 1 / editorBoardZoom;
    // first checkerboard tile that should be rendered
    // files are A-H (x), ranks are 1-8 (-y)
    let firstVisibleTileFile = Math.floor(
      editorBoardPositionX / boardTileSideLength
    );
    let firstVisibleTileRank = Math.floor(
      editorBoardPositionY / boardTileSideLength
    );
    // last checkerboard tile that should be rendered
    let lastVisibleTileFile = Math.floor(
      (editorBoardPositionX + windowWidth) / boardTileSideLength
    );
    let lastVisibleTileRank = Math.floor(
      (editorBoardPositionY + windowHeight) / boardTileSideLength
    );
    console.log(firstVisibleTileFile, lastVisibleTileFile);
    for (
      let currentTileFile = firstVisibleTileFile;
      currentTileFile <= lastVisibleTileFile;
      currentTileFile += 1
    ) {
      for (
        let currentTileRank = firstVisibleTileRank;
        currentTileRank <= lastVisibleTileRank;
        currentTileRank += 1
      ) {
        // the canvas pixel position of the tile's top left corner
        let currentTileDrawPosX =
          currentTileFile * boardTileSideLength - editorBoardPositionX;
        let currentTileDrawPosY =
          currentTileRank * boardTileSideLength - editorBoardPositionY;
        if ((currentTileFile + currentTileRank) % 2 === 1) {
			editorCtx.fillRect(
				currentTileDrawPosX,
				currentTileDrawPosY,
				boardTileSideLength,
				boardTileSideLength
			);
		}
          
      }
    }
  }
  function open() {
    style.revealElement(element_editor);
    drawCheckerboard();
    setInterval(() => {
      editorCtx.reset();
      editorBoardPositionX += 10;
      editorBoardPositionY += 10;
      drawCheckerboard();
    }, 200);
  }
  function close() {
    style.hideElement(element_editor);
  }
  // update editor board size to match screen size
  window.addEventListener("resize", () => {
    element_editorBoard.width = main.clientWidth;
    element_editorBoard.height = main.clientHeight;
    drawCheckerboard();
  });
  element_editorBoard.width = main.clientWidth;
  element_editorBoard.height = main.clientHeight;
  return Object.freeze({
    open,
    close,
  });
})();
