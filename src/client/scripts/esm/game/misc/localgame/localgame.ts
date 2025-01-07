

let inLocalGame: boolean = false;

function areInLocalGame(): boolean {
	return inLocalGame;
}

function initLocalGame() {
	inLocalGame = true;
}

function closeLocalGame() {

}}


export default {
	areInLocalGame,
	initLocalGame,
};