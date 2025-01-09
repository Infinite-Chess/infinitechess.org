

let inLocalGame: boolean = false;

function areInLocalGame(): boolean {
	return inLocalGame;
}

function initLocalGame() {
	inLocalGame = true;
}

function closeLocalGame() {
	// Does nothing currently.
	// But onlinegame.js has a closeOnlineGame() method so
	// may as well make it match
}


export default {
	areInLocalGame,
	initLocalGame,
	closeLocalGame,
};