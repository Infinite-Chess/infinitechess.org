
/**
 * This script compresses all our images.
 * 
 * Steps:
 * 
 * 1. Make sure the images you want compressed are located in dev-utils/image-sources/
 * They will be compressed to the same directory within src/client/img/

 * 2. Run the command:
 * npm run build-images
 */

import sharp from "sharp";
import { cpSync } from 'node:fs';
import path from "path";

import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Effort values
// Reduce to improve start times
const webp_effort = 6; // 0-6
const png_effort = 10; // 1-10
const avif_effort = 9; // 0-9

/**
 * @param {string} img Name of image
 * @param {string} format Format, either png, avif or webp
 * @returns {Number} effort Value of effort to override if is nto set
 */
function loadImageConfig(img, format, effort) {
	let config;
	// Make sure format exists
	if (format in optimised_images[img]) {
		config = optimised_images[img].avif;
	} else {
		config = {};
	}

	// If effor is not set overriede with effort variable
	if (!("effort" in config)) {
		config.effort = effort;
	}

	return config;
}

/**
 * Images to optimise.
 * Key is image name, value is options for each format.
 */
const optimised_images = {
	"king_w.png": {},
	"queen_w.png": {},
	"blank_board.png": {},
	"member_default.png": {},
	"/game/guide/promotionlines.png": {},
	"/game/guide/kingrookfork.png": {},
	"/game/guide/arrowindicators.png": {},
	"/game/guide/fairy/chancellor.png": {},
	"/game/guide/fairy/archbishop.png": {},
	"/game/guide/fairy/amazon.png": {},
	"/game/guide/fairy/guard.png": {},
	"/game/guide/fairy/hawk.png": {},
	"/game/guide/fairy/centaur.png": {},
	"/game/guide/fairy/knightrider.png": {},
	"/game/guide/fairy/obstacle.png": {},
	"/game/guide/fairy/void.png": {},
	"/game/guide/fairy/huygen.png": {},
};

// Destination folder
const dest_path = path.join(__dirname, `../../client/img/`);
// Source folder
const src_path = path.join(__dirname, `../../../dev-utils/image-sources/`);

// Copy images and override these with conflicting names
cpSync(
	src_path,
	dest_path,
	{
		recursive: true,
		force: true,
	},
);

// Counter for counter 
let finished_images = 0;
const total_images = Object.keys(optimised_images).length * 3;

function logProgress() {
	finished_images += 1;
	console.log(`Progress: ${Math.round(finished_images / total_images * 100)}%`);
	if (finished_images === total_images) {
		console.log("Done.");
	}
}

// Generate optimised images and copy them to /client/img
console.log("Converting images...");
for (const img in optimised_images) {
	const img_src_path = path.join(
		src_path,
		img,
	);
	sharp(img_src_path)
		.webp(loadImageConfig(img, "webp", webp_effort))
		.toFile(path.join(dest_path, `${img.replace(/\.[^/.]+$/, "")}.webp`), (err, info) => {
			logProgress();
		});

	sharp(img_src_path)
		.png(loadImageConfig(img, "png", png_effort))
		.toFile(path.join(dest_path, `${img.replace(/\.[^/.]+$/, "")}.png`), (err, info) => {
			logProgress();
		});

	sharp(img_src_path)
		.avif(loadImageConfig(img, "avif", avif_effort))
		.toFile(path.join(dest_path, `${img.replace(/\.[^/.]+$/, "")}.avif`), (err, info) => {
			logProgress();
		});
}