import { z } from "zod";
import { createGhRunner, type GhRunner } from "../run.ts";

const pageSchema = z.object({
	data: z.object({
		repository: z.object({
			pullRequest: z.object({
				headRefOid: z.string(),
				baseRefOid: z.string(),
				changedFiles: z.number().int().nonnegative(),
				files: z.object({
					nodes: z.array(z.object({ path: z.string() })),
					pageInfo: z.object({ hasNextPage: z.boolean(), endCursor: z.string().nullable() }),
				}),
			}),
		}),
	}),
});
const query = `query($owner:String!,$repo:String!,$number:Int!,$cursor:String) {
	repository(owner:$owner,name:$repo) { pullRequest(number:$number) {
		headRefOid baseRefOid changedFiles files(first:100,after:$cursor) { nodes { path } pageInfo { hasNextPage endCursor } }
	} }
}`;

export async function pullRequestChangedFilePaths(
	pull: { owner: string; repo: string; number: number; headSha: string },
	gh: GhRunner = createGhRunner(),
): Promise<string[]> {
	const paths: string[] = [];
	let cursor: string | null = null;
	let base: string | undefined;
	let count: number | undefined;
	do {
		const result = await gh("interactive", [
			"api",
			"graphql",
			"-f",
			`query=${query}`,
			"-f",
			`owner=${pull.owner}`,
			"-f",
			`repo=${pull.repo}`,
			"-F",
			`number=${pull.number}`,
			...(cursor === null ? [] : ["-f", `cursor=${cursor}`]),
		]);
		if (!result.ok) throw new Error("GitHub could not return the changed file list for the Jev gate.");
		let page: z.infer<typeof pageSchema>["data"]["repository"]["pullRequest"];
		try {
			page = pageSchema.parse(JSON.parse(result.stdout)).data.repository.pullRequest;
		} catch {
			throw new Error("GitHub returned an invalid changed file response for the Jev gate.");
		}
		if (
			page.headRefOid !== pull.headSha ||
			(base !== undefined && base !== page.baseRefOid) ||
			(count !== undefined && count !== page.changedFiles)
		)
			throw new Error("The pull request changed while the Jev gate read its files. Start a flow for the current diff.");
		base = page.baseRefOid;
		count = page.changedFiles;
		paths.push(...page.files.nodes.map((file) => file.path));
		const next = page.files.pageInfo;
		if (next.hasNextPage && (next.endCursor === null || next.endCursor === cursor || page.files.nodes.length === 0))
			throw new Error("GitHub returned an incomplete changed file list for the Jev gate.");
		cursor = next.hasNextPage ? next.endCursor : null;
	} while (cursor !== null);
	if (paths.length !== count || new Set(paths).size !== count)
		throw new Error("GitHub returned an incomplete changed file list for the Jev gate.");
	return paths;
}
