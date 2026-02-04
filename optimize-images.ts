// optimize-images.ts

/**
 * This script automatically finds and compresses all images from the source
 * directory that haven't already been fully optimized in the destination directory.
 *
 * Steps:
 *
 * 1. Place new or updated images in `dev-utils/image-sources/`.
 *    The same subdirectory structure will be maintained.
 *
 * 2. Run the command:
 *    npm run optimize-images
 *
 * Any images that already have at least one version .webp, .png, or .avif
 * in `src/client/img/` will be skipped. This is because sometimes we only need one format.
 */

import path from 'path';
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import { existsSync, readdirSync, statSync, mkdirSync } from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// --- CONFIGURATION ---

// Effort values. Higher mean better compression but longer processing time.
const webp_options = {
	effort: 6, // 0-6
	quality: 100, // Controls visual quality (1-100). Default if not specified: 80. USE 100 FOR NOISE TEXTURES!
};
const png_options = {
	effort: 10, // 1-10. LOWER YIELDS BETTER COMPRESSION??? But lower image quality.
	quality: 100, // Default if not specified: 100.
};
const avif_options = {
	effort: 9, // 0-9
	quality: 100, // Default if not specified: 50.
};

// Source folder for original images
const src_path = path.join(__dirname, `dev-utils/image-sources/`);
// Destination folder for compressed images
const dest_path = path.join(__dirname, `src/client/img/`);

const supportedExtensions = ['.png', '.jpg', '.jpeg'];

// --- LOGIC ---

/**
 * Recursively finds all image files in a directory.
 * @param {string} dirPath The directory to search.
 * @returns {string[]} An array of full paths to image files.
 */
function getAllImagePaths(dirPath: string): string[] {
	const allEntries = readdirSync(dirPath);
	const files: string[] = [];

	for (const entry of allEntries) {
		const fullPath = path.join(dirPath, entry);
		const stats = statSync(fullPath);

		if (stats.isDirectory()) {
			files.push(...getAllImagePaths(fullPath)); // Recurse into subdirectories
		} else if (supportedExtensions.includes(path.extname(entry).toLowerCase())) {
			files.push(fullPath);
		}
	}
	return files;
}

console.log('Scanning for images to process...');

// 1. Find all source images
const allSourceImages = getAllImagePaths(src_path);

// 2. Filter out images that are already fully optimized
const imagesToProcess = allSourceImages.filter((sourceImagePath) => {
	// Get the path relative to the source directory (e.g., 'badges/my-badge.png')
	const relativePath = path.relative(src_path, sourceImagePath);
	// Remove the original extension to create a base path for output files
	const destBasePath = path.join(dest_path, relativePath.replace(/\.[^/.]+$/, ''));

	// Check if all three target formats already exist
	const webpExists = existsSync(`${destBasePath}.webp`);
	const pngExists = existsSync(`${destBasePath}.png`);
	const avifExists = existsSync(`${destBasePath}.avif`);

	// If at least one exists, we can skip it. Otherwise, it needs processing.
	return !(webpExists || pngExists || avifExists);
});

if (imagesToProcess.length === 0) {
	console.log('All images are already up-to-date. Nothing to do.');
	process.exit(0);
}

console.log(`Found ${imagesToProcess.length} image(s) that need optimization.`);

// 3. Process the filtered images
let finished_images = 0;
const total_images = imagesToProcess.length * 3;

function logProgress(imageName: string, format: string): void {
	finished_images += 1;
	const percentage = Math.round((finished_images / total_images) * 100);
	console.log(
		`[${percentage}%] Optimized ${path.basename(imageName)} to ${format.toUpperCase()}`,
	);

	if (finished_images === total_images) {
		console.log('\nDone. All images have been processed.');
	}
}

console.log('Converting images...');

for (const sourceImagePath of imagesToProcess) {
	const relativePath = path.relative(src_path, sourceImagePath);
	const destBasePath = path.join(dest_path, relativePath.replace(/\.[^/.]+$/, ''));

	// Ensure the output directory exists before writing files
	const outputDir = path.dirname(destBasePath);
	if (!existsSync(outputDir)) {
		mkdirSync(outputDir, { recursive: true });
	}

	const imageProcessor = sharp(sourceImagePath);

	// Generate .webp
	imageProcessor.webp(webp_options).toFile(`${destBasePath}.webp`, (err) => {
		if (err) console.error(`Error converting ${relativePath} to WEBP:`, err);
		logProgress(relativePath, 'webp');
	});

	// Generate .png (re-optimizing the original)
	imageProcessor.png(png_options).toFile(`${destBasePath}.png`, (err) => {
		if (err) console.error(`Error converting ${relativePath} to PNG:`, err);
		logProgress(relativePath, 'png');
	});

	// Generate .avif
	imageProcessor.avif(avif_options).toFile(`${destBasePath}.avif`, (err) => {
		if (err) console.error(`Error converting ${relativePath} to AVIF:`, err);
		logProgress(relativePath, 'avif');
	});
}
