import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { readCsf } from "storybook/internal/csf-tools";
import { z } from "zod";
import { publicComponents } from "./publicComponents";

const root = resolve(import.meta.dir, "../../../..");
const directory = resolve(root, "apps/web/src/stories");
const coverageSchema = z.array(
	z.strictObject({
		source: z.string().min(1),
		export: z.string().min(1),
		stories: z.array(z.string().min(1)).min(1),
		states: z.array(z.string().min(1)).min(1),
		notes: z.string(),
	}),
);
const stories = new Set<string>();
const ids = new Set<string>();
for await (const file of new Bun.Glob("**/*.stories.{ts,tsx}").scan({ cwd: directory, absolute: true })) {
	const source = (await readCsf(file, { makeTitle: (title) => title })).parse();
	for (const story of source.indexInputs) {
		const key = `${story.title}/${story.exportName}`;
		if (stories.has(key) || ids.has(story.__id!)) throw new Error(`Duplicate story: ${key}`);
		stories.add(key);
		ids.add(story.__id!);
	}
}
const coverage: z.infer<typeof coverageSchema> = [];
for await (const file of new Bun.Glob("**/coverage*.json").scan({ cwd: directory, absolute: true })) {
	coverage.push(...coverageSchema.parse(await Bun.file(file).json()));
}
const failures: string[] = [];
for (const entry of coverage) {
	if (!existsSync(resolve(root, entry.source))) failures.push(`Missing source: ${entry.source}`);
	for (const story of entry.stories) {
		if (!stories.has(story)) failures.push(`${entry.export} points to a missing story: ${story}`);
	}
}
const exported = new Set<string>();
for (const file of ["index.ts", "review/index.ts", "terminal/index.ts"]) {
	for (const name of publicComponents(resolve(root, "packages/ui/src", file))) exported.add(name);
}
for (const name of exported) {
	if (!coverage.some((entry) => entry.export === name && entry.source.startsWith("packages/ui/"))) {
		failures.push(`Public component needs coverage: ${name}`);
	}
}
const routes = resolve(root, "apps/web/src/routes");
for await (const file of new Bun.Glob("**/*.{ts,tsx}").scan({ cwd: routes })) {
	const source = `apps/web/src/routes/${file}`;
	const content = await Bun.file(resolve(root, source)).text();
	if (
		/export const Route = create(File|Root)Route/.test(content) &&
		!coverage.some((entry) => entry.source === source)
	) {
		failures.push(`Route needs coverage: ${source}`);
	}
}
for await (const file of new Bun.Glob("**/*.{ts,tsx,json}").scan({ cwd: directory, absolute: true })) {
	const lines = (await Bun.file(file).text()).trimEnd().split("\n").length;
	if (lines > 300) failures.push(`${file} has ${lines} lines.`);
}
for (const failure of failures) console.error(failure);
console.log(`${stories.size} stories. ${coverage.length} coverage records. ${exported.size} public UI components.`);
process.exitCode = failures.length > 0 ? 1 : 0;
