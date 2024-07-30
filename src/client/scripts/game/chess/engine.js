const engine = (function() {
	/**
	 * 
	 * @param {gamefile} gamefile 
	 */
	function getIntersections(gamefile) {
		const intersections = new Set();

		const diagonalLineArr = [] // an array holding arrays of the slope and the y-intercept of each diagonal line respectfully. this will help us determine the intersections between them
		const xSet = new Set();
		const ySet = new Set();
		// generate the line array
		for (let i of Object.keys(gamefile.piecesOrganizedByKey)) {
			const [x,y] = math.getCoordsFromKey(i);
			xSet.add(x);
			ySet.add(y);
			const firstLine = [1, y - x];
			const secondLine = [-1, y + x];
			diagonalLineArr.push(firstLine, secondLine);
		}

		for (let i = 0; i < diagonalLineArr.length; i++) {
			const [m1, b1] = diagonalLineArr[i];

			// calculate its intersections with all horizontal lines
			for (let y of ySet) {
				// should be
				// intersections.add([(y - b1) / m1, y]);
				// but because m1 is either 1 or -1 multiplying is the same as dividing
				// and dividing is known to be slower.
				intersections.add([(y - b1) * m1, y]);
			}

			// calculate its intersecions with all vertical lines
			for (let x of xSet) {
				intersections.add([x, m1 * x + b1]);
			}

			for (let j = i + 1; j < diagonalLineArr.length; j++) {
				const [m2, b2] = diagonalLineArr[j];

				const intersectionX = (b2-b1)/(m1-m2);
				if (!isFinite(intersectionX) || !Number.isInteger(intersectionX)) continue;
				const intersectionY = m1 * intersectionX + b1
				intersections.add([intersectionX, intersectionY])
			}
		}

		return intersections;
	}

	return Object.freeze({
		getIntersections,
	})
})();