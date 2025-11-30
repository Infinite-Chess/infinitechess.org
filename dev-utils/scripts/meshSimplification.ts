

/**
 * This stores a mesh simplification algorithm Naviary designed to simplify the void mesh.
 * 
 * It can't be used anymore since a board editor may dynamically add and remove voids all the time.
 * We would have to regenerate the mesh every time.
 */

/**
 * Simplifies a list of void squares and merges them into larger rectangles.
 * @param voidList - The list of coordinates where all the voids are
 * @returns An array of rectangles that look like: `{ left, right, bottom, top }`.
 */
function simplifyMesh(voidList: PooledArray<Coords>): BoundingBox[] { // array of coordinates

	// console.log("Simplifying void mesh..")

	const voidHash: { [coordsKey: CoordsKey]: true } = {};
	for (const thisVoid of voidList) {
		if (!thisVoid) continue;
		const key = coordutil.getKeyFromCoords(thisVoid);
		voidHash[key] = true;
	}

	const rectangles: BoundingBox[] = []; // rectangle: { left, right, bottom, top }
	const alreadyMerged: { [coordsKey: CoordsKey]: true } = { }; // Set the coordinate key `x,y` to true when a void has been merged

	for (const thisVoid of voidList) { // [x,y]
		if (!thisVoid) continue;

		// Has this void already been merged with another previous?
		const key = coordutil.getKeyFromCoords(thisVoid);
		if (alreadyMerged[key]) continue; // Next void
		alreadyMerged[key] = true; // Set this void to true for next iteration

		let left = thisVoid[0];
		let right = thisVoid[0];
		let bottom = thisVoid[1];
		let top = thisVoid[1];
		let width = 1;
		let height = 1;

		let foundNeighbor = true;
		while (foundNeighbor) { // Keep expanding while successful

			// First test left neighbors

			let potentialMergers: CoordsKey[] = [];
			let allNeighborsAreVoid = true;
			let testX = left - 1;
			for (let a = 0; a < height; a++) { // Start from bottom and go up
				const thisTestY = bottom + a;
				const thisCoord: Coords = [testX, thisTestY];
				const thisKey = coordutil.getKeyFromCoords(thisCoord);
				const isVoid = voidHash[thisKey];
				if (!isVoid || alreadyMerged[thisKey]) {
					allNeighborsAreVoid = false;
					break; // Can't merge
				}
				potentialMergers.push(thisKey); // Can merge
			}
			if (allNeighborsAreVoid) { 
				left = testX; // Merge!
				width++;
				// Add all the merged squares to the already-merged list
				potentialMergers.forEach(key => { alreadyMerged[key] = true; });
				continue;
			}

			// Next test right neighbors

			potentialMergers = [];
			allNeighborsAreVoid = true;
			testX = right + 1;
			for (let a = 0; a < height; a++) { // Start from bottom and go up
				const thisTestY = bottom + a;
				const thisCoord: Coords = [testX, thisTestY];
				const thisKey = coordutil.getKeyFromCoords(thisCoord);
				const isVoid = voidHash[thisKey];
				if (!isVoid || alreadyMerged[thisKey]) {
					allNeighborsAreVoid = false;
					break; // Can't merge
				}
				potentialMergers.push(thisKey); // Can merge
			}
			if (allNeighborsAreVoid) { 
				right = testX; // Merge!
				width++;
				// Add all the merged squares to the already-merged list
				potentialMergers.forEach(key => { alreadyMerged[key] = true; });
				continue;
			}

			// Next test bottom neighbors

			potentialMergers = [];
			allNeighborsAreVoid = true;
			let testY = bottom - 1;
			for (let a = 0; a < width; a++) { // Start from bottom and go up
				const thisTestX = left + a;
				const thisCoord: Coords = [thisTestX, testY];
				const thisKey = coordutil.getKeyFromCoords(thisCoord);
				const isVoid = voidHash[thisKey];
				if (!isVoid || alreadyMerged[thisKey]) {
					allNeighborsAreVoid = false;
					break; // Can't merge
				}
				potentialMergers.push(thisKey); // Can merge
			}
			if (allNeighborsAreVoid) { 
				bottom = testY; // Merge!
				height++;
				// Add all the merged squares to the already-merged list
				potentialMergers.forEach(key => { alreadyMerged[key] = true; });
				continue;
			}

			// Next test top neighbors

			potentialMergers = [];
			allNeighborsAreVoid = true;
			testY = top + 1;
			for (let a = 0; a < width; a++) { // Start from bottom and go up
				const thisTestX = left + a;
				const thisCoord: Coords = [thisTestX, testY];
				const thisKey = coordutil.getKeyFromCoords(thisCoord);
				const isVoid = voidHash[thisKey];
				if (!isVoid || alreadyMerged[thisKey]) {
					allNeighborsAreVoid = false;
					break; // Can't merge
				}
				potentialMergers.push(thisKey); // Can merge
			}
			if (allNeighborsAreVoid) { 
				top = testY; // Merge!
				height++;
				// Add all the merged squares to the already-merged list
				potentialMergers.forEach(key => { alreadyMerged[key] = true; });
				continue;
			}

			foundNeighbor = false; // Cannot expand this rectangle! Stop searching
		}

		const rectangle: BoundingBox = { left, right, bottom, top };
		rectangles.push(rectangle);
	}

	// We now have a filled  rectangles  variable
	return rectangles;
}