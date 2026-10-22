import { chownSync } from 'node:fs';

// mounted volumes can hide the ownership set while building the image.
// drop every root group and both ids before importing application code.
if (process.getuid() === 0) {
	chownSync('/data', 1000, 1000);
	process.setgroups([]);
	process.setgid(1000);
	process.setuid(1000);
}

await import('../build/index.js');
