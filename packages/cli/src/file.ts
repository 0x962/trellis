import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { fileNotFound, fileUnreadable } from "./errors.ts";

// The file the command line names. The file system is a boundary: a path
// the process cannot open ends the run with one line and no request.
export const fileAt = (path: string): File => {
	try {
		return new File([readFileSync(path)], basename(path));
	} catch (error) {
		const failure = error as NodeJS.ErrnoException;
		if (failure.code === "ENOENT") throw fileNotFound(path);
		throw fileUnreadable(path, failure.message);
	}
};
