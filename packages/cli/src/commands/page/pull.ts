import { mkdirSync } from "node:fs";
import { dirname, resolve, sep } from "node:path";
import { PAGE_DOCUMENT_PATH } from "@trellis/api";
import { defineCommand } from "citty";
import { clientOf, clientOptions, throwErrorAnswer, trellisFetch } from "../../client.ts";
import { compact, contextOf } from "../../context.ts";
import { CliFailure } from "../../errors.ts";
import { printRecord, type RecordSpec } from "../../output.ts";
import { positiveInteger } from "./revision.ts";

type PullResult = { out: string; ref: string; version: number; files: string[] };

const pullRecord: RecordSpec<PullResult> = {
	fields: [
		{ name: "ref", value: (result) => result.ref },
		{ name: "version", value: (result) => String(result.version) },
		{ name: "out", value: (result) => result.out },
		{ name: "files", value: (result) => String(result.files.length) },
	],
	identifier: (result) => result.out,
};

// Each segment of a stored path travels as one segment of the address.
// `encodeURIComponent` escapes a slash, so a path is encoded segment by
// segment and keeps the slashes that separate its directories.
const encodePath = (path: string) => path.split("/").map(encodeURIComponent).join("/");

// The file that one stored path writes. The command writes under the
// directory the person named and nowhere else, so a path that resolves
// outside it ends the run before the first byte reaches the disk.
const targetOf = (out: string, path: string): string => {
	const root = resolve(out);
	const target = resolve(root, path);
	if (!target.startsWith(root + sep))
		throw new CliFailure("USAGE", 2, `the page holds the file ${path}, which is outside ${out}`);
	return target;
};

// The document and every asset of one version, written under `--out`. The
// files come through a render lease, which authorizes the content route for
// that one version. Each file streams from the answer to the disk, so a
// version of 250 MB costs the memory of one chunk.
//
// A file that the directory already holds is overwritten.
export const pull = defineCommand({
	meta: { name: "pull", description: "Write the document and the assets of one page version to a directory" },
	args: {
		page: { type: "positional", required: true, description: "Page ref" },
		out: { type: "string", required: true, description: "Directory that receives index.html and the assets" },
		version: { type: "string", description: "Version number; the newest version by default" },
	},
	async run(context) {
		const ctx = contextOf(context);
		const { args } = context;
		const client = clientOf(ctx);
		const pulled = await client.pages.pull(
			compact({ page: args.page, version: positiveInteger(args.version, "--version") }),
		);
		const lease = await client.pages.createRenderLease({ page: pulled.page.id, version: pulled.version.number });
		const fetchFile = trellisFetch(clientOptions(ctx));
		const files = [PAGE_DOCUMENT_PATH, ...pulled.assets.map((asset) => asset.path)];
		for (const path of files) {
			const target = targetOf(args.out, path);
			const response = await fetchFile(new Request(`${ctx.url}${lease.contentRoot}${encodePath(path)}`), {});
			if (!response.ok) await throwErrorAnswer(response);
			mkdirSync(dirname(target), { recursive: true });
			await Bun.write(target, response);
		}
		const result = { out: args.out, ref: pulled.page.ref, version: pulled.version.number, files };
		printRecord(ctx.out, ctx.format, result, pullRecord);
	},
});
