import { readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join, relative, resolve } from "node:path";
import { PAGE_DOCUMENT_PATH, PageAssetPathSchema, PageSourcePathSchema } from "@trellis/api";
import { fileNotFound, fileUnreadable, usageError } from "../../errors.ts";

// One file of a publication, and the address it holds inside the page. The
// document holds `index.html`, and every other file holds its path under the
// directory the command names.
export type SourceFile = { file: File; path: string };

export type PageSource = { document: File; assets: SourceFile[]; sourcePath: string };

// The bytes of one file, under the name and the media type of its path.
// `page_assets` stores that type and the content route serves it with
// `nosniff`, so a stylesheet sent with no type never styles the page.
const pageFile = (path: string, name: string): File => {
	try {
		return new File([readFileSync(path)], name, { type: Bun.file(path).type });
	} catch (error) {
		const failure = error as NodeJS.ErrnoException;
		if (failure.code === "ENOENT") throw fileNotFound(path);
		throw fileUnreadable(path, failure.message);
	}
};

// Every file under `root`, as a path with forward slashes and no leading
// dot. A link to a file is read as a file. A link to a directory is left
// out, because a link that names one of its own parents never ends.
const walk = (root: string, prefix: string): string[] => {
	const here = prefix === "" ? root : join(root, prefix);
	return readdirSync(here, { withFileTypes: true }).flatMap((entry) => {
		const path = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
		if (entry.isDirectory()) return walk(root, path);
		if (entry.isFile()) return [path];
		return entry.isSymbolicLink() && statSync(join(here, entry.name)).isFile() ? [path] : [];
	});
};

// The path the version records as the provenance of its bytes. A path under
// the current directory records that relative path, so a reader of the
// version opens the same file. Any other path records its last segment
// alone, because the server refuses an absolute path and a path that walks
// out of the directory it starts in.
export const sourcePathOf = (path: string, cwd: string): string => {
	const full = resolve(cwd, path);
	const value = relative(cwd, full);
	return PageSourcePathSchema.safeParse(value).success ? value : basename(full);
};

const assetOf = (root: string, path: string): SourceFile => {
	const parsed = PageAssetPathSchema.safeParse(path);
	if (!parsed.success) throw usageError(`${path} cannot be an asset path: ${parsed.error.issues[0]!.message}`);
	return { file: pageFile(join(root, path), basename(path)), path };
};

// The document and the assets the command line names. A file is one page
// with no asset. A directory is `index.html` with every other file under it.
export const pageSourceAt = (path: string, cwd: string): PageSource => {
	const full = resolve(cwd, path);
	const sourcePath = sourcePathOf(path, cwd);
	let stats: ReturnType<typeof statSync>;
	try {
		stats = statSync(full);
	} catch (error) {
		const failure = error as NodeJS.ErrnoException;
		if (failure.code === "ENOENT") throw fileNotFound(path);
		throw fileUnreadable(path, failure.message);
	}
	if (!stats.isDirectory()) {
		return { document: pageFile(full, PAGE_DOCUMENT_PATH), assets: [], sourcePath };
	}
	// The directory answers its entries in the order of the file system.
	// Sorted paths give one publication of one directory the same asset
	// order every time, so two versions of a page compare line by line.
	const paths = walk(full, "").sort();
	if (!paths.includes(PAGE_DOCUMENT_PATH)) throw usageError(`${path} holds no ${PAGE_DOCUMENT_PATH}`);
	return {
		document: pageFile(join(full, PAGE_DOCUMENT_PATH), PAGE_DOCUMENT_PATH),
		assets: paths.filter((entry) => entry !== PAGE_DOCUMENT_PATH).map((entry) => assetOf(full, entry)),
		sourcePath,
	};
};
