


// ======================================== ORTHOGONAL SOLVER ========================================


// /**
//  * On either the X or Y axis groups, initially sets each's transformedRange,
//  * and their pieces' transformed coordinates according to the position's
//  * orthogonal compressed solution.
//  */
// function TransformToOrthogonalSolution(axisOrder: AxisOrder, coordIndex: 0 | 1) {
// 	let current: bigint = 0n;

// 	for (const group of axisOrder) {
// 		// Update the group's transformed range
// 		const groupSize = group.range[1] - group.range[0];
// 		// Set the group's first draft transformed range.
// 		group.transformedRange = [current, current + groupSize];

// 		// Update each piece's transformed coordinates
// 		for (const piece of group.pieces) {
// 			// Add the piece's offset from the start of the group
// 			const offset = piece.coords[coordIndex] - group.range[0];
// 			piece.transformedCoords[coordIndex] = group.transformedRange![0] + offset;
// 		}

// 		// Increment so that the next group has what's considered an arbitrary spacing between them
// 		current += MIN_ARBITRARY_DISTANCE + groupSize;
// 	}
// }


// ======================================== HELPERS ========================================




// /**
//  * Calculates the amount a piece should be pushed to align with another piece.
//  * It returns zero if the minimum space requirement is met already.
//  */
// function getShortFall(v_requirement: SeparationRequirement, current_dv: bigint): bigint {
// 	// --- 3. CALCULATE V-AXIS SHORTFALL ---
// 	let v_shortfall = 0n;

// 	if (v_requirement.type === 'exact') {
// 		// If the requirement is exact, any deviation is a shortfall.
// 		v_shortfall = v_requirement.separation - current_dv;
// 	} else if (v_requirement.type === 'min') {
// 		// If the requirement is a minimum, we only have a shortfall if we're below it.
// 		if (current_dv < v_requirement.separation) {
// 			v_shortfall = v_requirement.separation - current_dv;
// 		}
// 	} else if (v_requirement.type === 'max') {
// 		// If the requirement is a maximum, we only have a shortfall if we're above it.
// 		if (current_dv > v_requirement.separation) {
// 			v_shortfall = v_requirement.separation - current_dv;
// 		}
// 	}

// 	return v_shortfall;
// }

// /**
//  * Calculates the collapsible gap between a group and the group immediately following it on a given axis.
//  * This gives the amount the group can be pushed WITHOUT AFFECTING FOLLOWING GROUPS!
//  * @param axis - The orthogonal axis ('1,0' or '0,1') to measure the gap on.
//  * @param groupIndex - The index of the group to check how much it can be pushed.
//  * @returns The collapsible gap size as a non-negative bigint. Returns 0n if there is no collapsible space.
//  */
// function calculateCollapsableGap(axis: '1,0' | '0,1', AllAxisOrders: AxisOrders, groupIndex: number): bigint {
// 	const axisOrder = AllAxisOrders[axis];

// 	const currentGroup = axisOrder[groupIndex];
// 	const nextGroup = axisOrder[groupIndex + 1]!;

// 	// The gap is the space between the end of the current group and the start of the next,
// 	// minus the required padding. This is the amount of space that a push can "collapse".
// 	const gap = nextGroup.transformedRange![0] - currentGroup.transformedRange![1] - MIN_ARBITRARY_DISTANCE;
	
// 	// The gap should never be negative in a valid state, but if it is, there's no collapsible space.
// 	if (gap < 0n) throw Error("Overlapping groups!"); // Safety check
	
// 	return gap;
// }

// /**
//  * Calculates the total empty space (the sum of all gaps) between two groups on a given orthogonal axis.
//  * The order of the group indices does not matter.
//  * @param axis - The orthogonal axis ('1,0' or '0,1') to measure the gap on.
//  * @param groupIndexA - The index of the first group.
//  * @param groupIndexB - The index of the second group.
//  * @returns The total gap size as a non-negative bigint. Returns 0n if the groups are adjacent or overlapping.
//  */
// function calculateGapBetweenGroups(axis: '1,0' | '0,1', AllAxisOrders: AxisOrders, groupIndexA: number, groupIndexB: number): bigint {
// 	const axisOrder = AllAxisOrders[axis];

// 	// Ensure startIndex is the smaller of the two indices.
// 	const startIndex = Math.min(groupIndexA, groupIndexB);
// 	const endIndex = Math.max(groupIndexA, groupIndexB);

// 	// If the groups are the same, there is no gap between them.
// 	if (endIndex === startIndex) return 0n;

// 	let totalGap: bigint = 0n;

// 	// Iterate through the groups *between* startIndex and endIndex.
// 	for (let i = startIndex; i < endIndex; i++) {
// 		const currentGroup = axisOrder[i];
// 		const nextGroup = axisOrder[i + 1];

// 		// The gap is the space between the end of the current group and the start of the next, subtract the padding.
// 		const gap = nextGroup.transformedRange![0] - MIN_ARBITRARY_DISTANCE - currentGroup.transformedRange![1];
// 		if (gap < 0n) throw Error("Gap is < 0!"); // Protection in case this bug ever happens.
		
// 		totalGap += gap;
// 	}

// 	return totalGap;
// }

// VERSION THAT PUSHES ALL GROUPS AFTERWARD EQUALLY, WITHOUT ABSORBING GAPS
// /**
//  * Pushes all groups on a given orthogonal axis from a starting index onwards by a specific amount.
//  * @param axisToPush 
//  * @param axisOrder 
//  * @param startingGroupIndex - This group and all following groups will be pushed by the same amount.
//  * @param pushAmount 
//  * @param coordIndex 
//  */
// function ripplePush(axisToPush: '1,0' | '0,1', AllAxisOrders: AxisOrders, startingGroupIndex: number, pushAmount: bigint) {
// 	if (pushAmount <= 0n) throw Error(`Ripple push amount must be positive, got ${pushAmount}.`);

// 	const coordIndex = axisToPush === '1,0' ? 0 : 1;
// 	const axisOrder = AllAxisOrders[axisToPush];

// 	const word = axisToPush === '1,0' ? 'RIGHT' : 'UP';
// 	console.log(`Ripple pushing group of index ${startingGroupIndex} ${word} by ${pushAmount}...`);

// 	for (let i = startingGroupIndex; i < axisOrder.length; i++) {
// 		const groupToPush = axisOrder[i];
// 		pushGroup(groupToPush, pushAmount, coordIndex);
// 	}
// }

// /**
//  * Pushes a given piece's group in the specified X/Y direction by a specific amount.
//  * If there are any gaps in the X/Y axis groups to be filled behind it, it will do so,
//  * otherwise, it will ripple push all groups in front of it, too.
//  * In other words, subsequent groups will only be pushed by enough to ensure there
//  * is no overlap between the last pushed group and them.
//  * @param axis - What X/Y axis to ripple push the groups on.
//  * @param firstPiece - This piece isn't pushed by the ripple, nor is its group.
//  * @param piece - The piece of which group we are GUARANTEED to push. We will see if its optimal to push groups immediately before it, but not firstPiece's group or prior.
//  * @param pushAmount - The amount to push the piece's group by. Subsequent groups will only be pushed enough to ensure there aren't any overlaps in groups.
//  * @param axisDeterminer - What AxisDeterminer to use to calculate the error with the push. NOT the same as the direction of the push!!
//  */
// function ripplePush(
// 	axis: '1,0' | '0,1',
// 	AllAxisOrders: AxisOrders,
// 	piece: PieceTransform,
// 	pushAmount: bigint,
// ) {
// 	if (pushAmount <= 0n) throw Error(`Ripple push amount must be positive, got ${pushAmount}.`);

// 	const word = axis === '1,0' ? 'RIGHT' : 'UP';

// 	const coordIndex = axis === '1,0' ? 0 : 1;
// 	const axisOrder = AllAxisOrders[axis];

// 	console.log(`Ripple pushing group of piece ${String(piece.transformedCoords)} ${word} by ${pushAmount}...`);

// 	// Perform the mandatory push on the piece's group and contionally, subsequent groups.
// 	// If subsequent groups can fill a gap in this axis, they will. They just don't like to overlap.
	
// 	// We know this push is REQUIRED because it is the ONLY action that will satisfy
// 	// the constraint between piece A and piece B!

// 	// First, push the group of the piece that is mandatory to be pushed.
// 	const mandatoryGroup = axisOrder[piece.axisGroups[axis]];
// 	pushGroup(mandatoryGroup, pushAmount, coordIndex);

// 	// Next, we're going to iterate through all subsequent groups,
// 	// IF THEY NOW OVERLAP with the last pushed group, we push
// 	// them right too, by the minimum amount to make their range start
// 	// line up with the range end of the last pushed group.
// 	let lastPushedGroup = mandatoryGroup;
// 	for (let i = piece.axisGroups[axis] + 1; i < axisOrder.length; i++) {
// 		const groupToUpdate = axisOrder[i];

// 		// If the last pushed group and this group now overlap, we need to push this group too,
// 		// enough so that it starts at the end of the last pushed group's range end.
// 		if (groupToUpdate.transformedRange![0] < lastPushedGroup.transformedRange![1] + MIN_ARBITRARY_DISTANCE) {
// 			// Calculate how much to push this group by so that it starts at the end of the last pushed group's range.
// 			const pushAmount = lastPushedGroup.transformedRange![1] + MIN_ARBITRARY_DISTANCE - groupToUpdate.transformedRange![0];
// 			console.log(`Pushing next group by ${pushAmount} to avoid overlap.`);
// 			pushGroup(groupToUpdate, pushAmount, coordIndex);
// 			lastPushedGroup = groupToUpdate; // Update the last pushed group
// 		} else {
// 			// No more groups to push, as they are not overlapping anymore.
// 			break;
// 		}
// 	}
// }

// /**
//  * Pushes a group by a specific amount in the X or Y direction,
//  * updating its transformed range and the transformed coordinates of all pieces in the group.
//  */
// function pushGroup(group: AxisGroup, pushAmount: bigint, coordIndex: 0 | 1) {
// 	// Update the transformed range of this group
// 	group.transformedRange![0] += pushAmount;
// 	group.transformedRange![1] += pushAmount;

// 	// Update the transformed coords of all pieces in this group
// 	for (const pieceToPush of group.pieces) {
// 		pieceToPush.transformedCoords[coordIndex]! += pushAmount;
// 	}
// }


// /**
//  * Takes a push amount and returns the level of error it has (absolute value).
//  */
// function calculateError(pushAmount: bigint) {
// 	return bimath.abs(pushAmount);
// }

// /**
//  * Calculates the sum of all errors on the board on a specific axis between every single pair of pieces.
//  * This gives one GRAND score where the higher the score, the more incorrect the pieces are relative
//  * to each other (on that axis), and a score of 0n means the pieces are positioned PERFECT
//  * relative to each other and no pushes are necessary anymore to satisfy all constraints between them.
//  */
// function calculateTotalAxisError(pieces: PieceTransform[], axisDeterminer: AxisDeterminer): bigint {
// 	let totalError = 0n;
// 	for (let i = 0; i < pieces.length; i++) {
// 		const pieceA = pieces[i];
// 		for (let j = i + 1; j < pieces.length; j++) {
// 			const pieceB = pieces[j];

// 			const axisDiff_Original = axisDeterminer(pieceA.coords) - axisDeterminer(pieceB.coords);
// 			const axisDiff_Transformed = axisDeterminer(pieceA.transformedCoords as Coords) - axisDeterminer(pieceB.transformedCoords as Coords);

// 			const pushAmount = calculatePushAmount(axisDiff_Original, axisDiff_Transformed);
// 			totalError += calculateError(pushAmount);
// 		}
// 	}
// 	return totalError;
// }

// /**
//  * Calculates the topology of the board on a specific diagonal axis.
//  * This is used for comparing against after doing some pushes
//  * to detect if we've starting infinite repeating.
//  * @param axis 
//  * @param AllAxisOrders 
//  */
// function calculateBoardTopology(pieces: PieceTransform[], axisDeterminer: AxisDeterminer): bigint[] {

// 	const topology: bigint[] = [];

// 	// Calculate the spacing between each pair of pieces on the board.
// 	for (let i = 0; i < pieces.length; i++) {
// 		const pieceA = pieces[i];
// 		const pieceA_AxisValue = axisDeterminer(pieceA.transformedCoords as Coords);
// 		for (let j = i + 1; j < pieces.length; j++) {
// 			const pieceB = pieces[j];
// 			const pieceB_AxisValue = axisDeterminer(pieceB.transformedCoords as Coords);

// 			let axisDiff = pieceB_AxisValue - pieceA_AxisValue;

// 			// Cap the axisDiff to the +-MIN_ARBITRARY_DISTANCE
// 			axisDiff = bimath.clamp(axisDiff, -MIN_ARBITRARY_DISTANCE, MIN_ARBITRARY_DISTANCE);

// 			topology.push(axisDiff);
// 		}
// 	}

// 	return topology;
// }