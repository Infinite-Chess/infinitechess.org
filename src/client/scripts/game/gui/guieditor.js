/**
 * This script manages the editor
 */

"use strict";

const guieditor = (function () {
  const element_editor = document.getElementById("editor");
  const element_editorBoard = document.getElementById("editor-board");
  const element_editorSidebar = document.getElementById("editor-sidebar");
  function open() {
    style.revealElement(element_editor);
    addListeners();
  }
  function close() {
    style.hideElement(element_editor);
    removeListeners();
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
  }
  // callback for editor pointer mode selection
  function callback_editorPointerModeSelection(event) {
	let clickedEditorPointerMode = event.target;
    let currentlySelectedEditorPointerMode = document.querySelector(
      ".editor-selected-pointer-mode"
    );
    if (!currentlySelectedEditorPointerMode) {
      // nothing was selected beforehand
      clickedEditorPointerMode.classList.add("editor-selected-pointer-mode");
      return;
    }
    currentlySelectedEditorPointerMode.classList.remove(
      "editor-selected-pointer-mode"
    );
    if (clickedEditorPointerMode !== currentlySelectedEditorPointerMode) {
      // if editorPointerMode was deselected, don't reselect
      clickedEditorPointerMode.classList.add("editor-selected-pointer-mode");
    }
  }

  return Object.freeze({
    open,
    close,
  });
})();
