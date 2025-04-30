
/**
 * This script initiates teleports to all mini images and square annotes clicked.
 */

import miniimage from "../miniimage.js"
import drawsquares from "./annotations/drawsquares.js"
// @ts-ignore
import input from "../../input.js";
// @ts-ignore
import transition from "../transition.js";



function testIfClickedEntity() {
    if (!input.getPointerClicked()) return;

    const allEntitiesHovered = [...miniimage.getImagesHovered(), ...drawsquares.highlightsHovered];
    if (allEntitiesHovered.length > 0) transition.initTransitionToCoordsList(allEntitiesHovered);
}


export default {
    testIfClickedEntity,
}