# Dev Utils

This directory contains both depricated scripts that we believe might be useful in the future, as well as assets useful for development but not production.

No source code script imports and runs any code from this directory, it is completely isolated from the production codebase.

For this reason, code in here does not have to follow linting or formatting rules.

## image-sources/

Contains original, uncompressed source images. Running `npm run optimize-images` will compress and convert any new images here into `.webp`, `.png`, and `.avif` formats, outputting them to `src/client/img/` while preserving the subdirectory structure.