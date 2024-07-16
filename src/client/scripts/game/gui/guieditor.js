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
	}
	function close() {
		style.hideElement(element_editor);
	}
	return Object.freeze({
		open,
		close
	});
})();
