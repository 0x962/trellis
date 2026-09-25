import type { PagePublishInput, PageUpload } from "@trellis/api";
import { defineCommand } from "citty";
import { clientOf } from "../../client.ts";
import { type CliContext, compact, contextOf, readText } from "../../context.ts";
import { usageError } from "../../errors.ts";
import { printRecord } from "../../output.ts";
import { type PageSource, pageSourceAt } from "./pageSource.ts";
import { publishedRecord } from "./pageText.ts";
import { positiveInteger } from "./revision.ts";

type PublishArgs = {
	path: string;
	project?: string;
	title?: string;
	page?: string;
	"expected-version"?: string;
	summary?: string;
	label?: string;
	"source-path"?: string;
	"request-id"?: string;
};

// A publication names a project and a title to create a page, or a page and
// the revision the caller last read to add a version to it. The server
// refuses every other pair, and these lines name the missing flag instead.
const checkPublishFlags = (args: PublishArgs) => {
	if (args.project === undefined && args.page === undefined) throw usageError("publish needs --project or --page");
	if (args.project !== undefined && args.page !== undefined)
		throw usageError("publish takes --project or --page, not both");
	if (args.project !== undefined && args.title === undefined) throw usageError("a new page needs --title");
	if (args.page !== undefined && args.title !== undefined)
		throw usageError("a new version keeps the title; change it with trellis page rename");
	if (args.page !== undefined && args["expected-version"] === undefined)
		throw usageError("a new version needs --expected-version, the revision trellis page show prints");
};

// The project that holds the staged files. A new page names its project on
// the command line. A new version of a page reads the project of that page,
// because an upload belongs to one project and the caller names only the page.
const projectOf = async (ctx: CliContext, args: PublishArgs): Promise<string> => {
	if (args.project !== undefined) return args.project;
	return (await clientOf(ctx).pages.get({ page: args.page! })).projectId;
};

// Every file of the publication, staged one at a time. The server holds one
// database connection, so parallel uploads make every other request of the
// host wait behind them.
const stage = async (ctx: CliContext, project: string, source: PageSource): Promise<PageUpload[]> => {
	const client = clientOf(ctx);
	const staged: PageUpload[] = [];
	for (const file of [source.document, ...source.assets.map((asset) => asset.file)]) {
		staged.push(await client.pages.upload({ project, file }));
	}
	return staged;
};

export const publish = defineCommand({
	meta: { name: "publish", description: "Publish a page version from an HTML file or a directory" },
	args: {
		path: { type: "positional", required: true, description: "HTML file, or a directory that holds index.html" },
		project: { type: "string", description: "Project ref of a new page" },
		title: { type: "string", description: "Title of a new page" },
		page: { type: "string", description: "Page ref that receives a new version" },
		"expected-version": { type: "string", description: "Page revision the caller last read" },
		summary: { type: "string", description: "Page summary, or - for standard input" },
		label: { type: "string", description: "Label of this version" },
		"source-path": { type: "string", description: "Source path the version records" },
		"request-id": { type: "string", description: "UUID of this publication; repeat it to retry one publication" },
	},
	async run(context) {
		const ctx = contextOf(context);
		const args = context.args as PublishArgs;
		checkPublishFlags(args);
		const source = pageSourceAt(args.path, process.cwd());
		const project = await projectOf(ctx, args);
		const staged = await stage(ctx, project, source);
		const input: PagePublishInput = compact({
			requestId: args["request-id"] ?? crypto.randomUUID(),
			project: args.project,
			page: args.page,
			expectedVersion: positiveInteger(args["expected-version"], "--expected-version"),
			title: args.title,
			summary: args.summary === undefined ? undefined : await readText(ctx, args.summary),
			label: args.label,
			document: staged[0]!.id,
			assets: source.assets.map((asset, index) => ({ uploadId: staged[index + 1]!.id, path: asset.path })),
			sourcePath: args["source-path"] ?? source.sourcePath,
		});
		printRecord(ctx.out, ctx.format, await clientOf(ctx).pages.publish(input), publishedRecord);
	},
});
