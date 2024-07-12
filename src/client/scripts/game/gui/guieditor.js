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
  const placedPieces = new Map([
	[]
  ]);

  // the zoom of the editor, from 1/Infinity to 1
  const editorBoardZoom = 0.02;
  // The position of the top-left corner of screen
  // 1 / editorBoardZoom is the size of 1 time,
  // so the top left corner would be at the tile 1,1 instead of 0,0
  let editorBoardPositionX = 1 / editorBoardZoom;
  let editorBoardPositionY = 1 / editorBoardZoom;

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
    element_editorBoard.width = element_editorBoard.clientWidth;
    element_editorBoard.height = element_editorBoard.clientHeight;
    drawCheckerboard();
    addListeners();
  }
  function close() {
    style.hideElement(element_editor);
    removeListeners();
  }
  // update editor board size to match screen size
  window.addEventListener("resize", () => {
    element_editorBoard.width = element_editorBoard.clientWidth;
    element_editorBoard.height = element_editorBoard.clientHeight;
    drawCheckerboard();
  });
  // Add backgrounds to editor sidebar pieces
  for (const editorPointerModePiece of document.getElementsByClassName(
    "editor-pointer-mode-piece"
  )) {
    editorPointerModePiece.style.backgroundImage = `url("${editorPointerModePiece.dataset.pieceImgUrl}")`;
  }

  function addListeners() {
    let currentlySelected = null;
    // make each pointer mode selectable
    for (const editorPointerMode of document.getElementsByClassName(
      "editor-pointer-mode"
    )) {
      editorPointerMode.addEventListener(
        "click",
        callback_editorPointerModeSelection
      );
    }
    element_editorBoard.addEventListener("click", callback_addPieceAtPointer);
  }
  function removeListeners() {
    for (const editorPointerMode of document.getElementsByClassName(
      "editor-pointer-mode"
    )) {
      editorPointerMode.removeEventListener(
        "click",
        callback_editorPointerModeSelection
      );
    }
    element_editorBoard.removeEventListener(
      "click",
      callback_addPieceAtPointer
    );
  }
  // callback for editor pointer mode selection
  function callback_editorPointerModeSelection() {
    let currentlySelectedEditorPointerMode = document.querySelector(
      ".editor-selected-pointer-mode"
    );
    if (!currentlySelectedEditorPointerMode) {
      // nothing was selected beforehand
      editorPointerMode.classList.add("editor-selected-pointer-mode");
      return;
    }
    currentlySelectedEditorPointerMode.classList.remove(
      "editor-selected-pointer-mode"
    );
    if (editorPointerMode !== currentlySelectedEditorPointerMode) {
      // if editorPointerMode was deselected, don't reselect
      editorPointerMode.classList.add("editor-selected-pointer-mode");
    }
  }

  function callback_addPieceAtPointer(event) {
    let { top: editorBoardTop, left: editorBoardLeft } =
      element_editorBoard.getBoundingClientRect();
    let editorBoardPointerX = event.clientX - editorBoardLeft;
    let editorBoardPointerY = event.clientY - editorBoardTop;
    let boardTileSideLength = 1 / editorBoardZoom;

    // files are A-H (x), ranks are 1-8 (-y)
    let clickedTileFile = Math.floor(
      (editorBoardPositionX + editorBoardPointerX) / boardTileSideLength
    );
    let clickedTileRank = Math.floor(
      (editorBoardPositionY + editorBoardPointerY) / boardTileSideLength
    );
    console.log(clickedTileFile, clickedTileRank);
  }

  return Object.freeze({
    open,
    close,
  });
})();
