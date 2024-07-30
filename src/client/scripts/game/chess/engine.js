const engine = (function() {
	/**
	 * 
	 * @param {gamefile} gamefile 
	 */
	function getIntersections(gamefile) {
		const intersections = new Set(); // make it a Set so squares dont get duplicated.

		const diagonalLineArr = [] // an array holding the slope and the y-intercept of each diagonal line. this will help us determine the intersections between them

		// generate the line array
		for (let i of Object.keys(gamefile.piecesOrganizedByKey)) {
			const [x,y] = math.getCoordsFromKey(i);
			const firstLine = [1 ,y - x];
			const secondLine = [-1, y + x]

		}
	}

	return Object.freeze({
		getIntersections,
	})
})();