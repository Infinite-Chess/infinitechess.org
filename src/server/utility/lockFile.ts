
// src/server/utility/lockFile.ts

/**
 * This module extends the 'fs' module with methods
 * that lock a file while it is being read/written.
 * If you try to read/write a file while it is locked,
 * you will get an error.
 * 
 * This prevents data corruption when multiple code points
 * try to read/write the members file at the same time.
 */

import lockfile from 'proper-lockfile';
import fs from 'fs/promises';

// Locks the file while reading, then immediately unlocks and returns the data.
// MUST BE CALLED WITH 'await' or this returns a promise!
async function readFile<D>(path: string, buffer: BufferEncoding = 'utf-8'): Promise<D> {
	let data: D | undefined;
	await lockfile.lock(path)
		.then(async(releaseFunc) => {
			// Do something while the file is locked
			try {
				const fileContents = await fs.readFile(path, buffer);
				data = JSON.parse(fileContents);
			} finally {
				// Don't CATCH the error, but always release the lock, even if we encounter an error!
				releaseFunc(); // Unlocks file
			}
		});
	return data!; // Guaranteed to be defined, since if it isn't, the function will have thrown anyway.
};

// Returns false when failed to lock/write file.
// MUST BE CALLED WITH 'await' or this returns a promise!
async function writeFile(path: string, object: any): Promise<void> {
	await lockfile.lock(path)
		.then(async(release) => {
			// Do something while the file is locked
			try {
				await fs.writeFile(path, JSON.stringify(object, null, 1));
			} finally {
				// Don't CATCH the error, but always release the lock, even if we encounter an error!
				release(); // Unlocks file
			}
		});
};

export {
	readFile,
	writeFile
};