
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
import fs from 'fs';

// Locks the file while reading, then immediately unlocks and returns the data.
// MUST BE CALLED WITH 'await' or this returns a promise!
const readFile = async<D>(path: string, buffer: BufferEncoding = 'utf-8'): Promise<D> => {
	let data: object;
	await lockfile.lock(path)
		.then((releaseFunc) => {
			// Do something while the file is locked
			try {
				data = JSON.parse(fs.readFileSync(path, buffer));
			} catch (e) { // Catching the error within JSON parsing like this allows us to unlock the file afterwards!
				releaseFunc();
				throw e;
			}
			releaseFunc();
		});
	// @ts-ignore
	return data;
};

// Returns false when failed to lock/write file.
// MUST BE CALLED WITH 'await' or this returns a promise!
const writeFile = async(path: string, object: object): Promise<void> => {
	await lockfile.lock(path)
		.then((release) => {
			// Do something while the file is locked
			fs.writeFileSync(
				path,
				JSON.stringify(object, null, 1)
				// , (err) => {
				//     if (err) console.error(errorString, err);
				//     else status = true;
				// }
			);
			return release(); // Unlocks file
		});
	return;
};

// Locks file before reading, editing, and saving.
// MUST BE CALLED WITH 'await' or this returns a promise!
// eslint-disable-next-line no-unused-vars
const editFile = async<D>(path: string, callback: (data: D) => D, buffer: BufferEncoding = 'utf-8'): Promise<void> => {
	await lockfile.lock(path)
		.then((release) => {
			// Do something while the file is locked
			let data = JSON.parse(fs.readFileSync(path, buffer));
			data = callback(data);
			fs.writeFileSync(
				path,
				JSON.stringify(data, null, 1)
			);
			return release(); // Unlocks file
		});
	return;
};

export {
	readFile,
	writeFile,
	editFile
};