import boardeditor from "../misc/boardeditor.js";

const element_editToolsMenu = document.getElementById('board-edit-tools')!;
const element_navigationBar = document.getElementById('navigation-bar')!;
const element_editTools = document.querySelectorAll('.board-edit-tools div')!;

let isOpen = false;

function open() {
	element_editToolsMenu.classList.remove('hidden');
	element_navigationBar.classList.add('vertical');
	initListeners();
	isOpen = true;
}

function close() {
	element_editToolsMenu.classList.add('hidden');
	element_navigationBar.classList.remove('vertical');
	closeListeners();
	isOpen = false;
}

function initListeners() {
	element_editTools.forEach((element) => {
		element.addEventListener('click', callback_ChangeTool);
	});
}

function closeListeners() {
	element_editTools.forEach((element) => {
		element.removeEventListener('click', callback_ChangeTool);
	});
}

function callback_ChangeTool(e: Event) {
	const tool = (e.target as HTMLElement).dataset['tool']!;
	if (tool === "save") return boardeditor.save();
	if (tool === "color") return boardeditor.toggleColor();
	if (tool === "clear") return boardeditor.clearAll();
	boardeditor.setTool(tool);
}

export default {
	open,
	close,
};