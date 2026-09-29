import { expect, test } from "bun:test";

for (const entry of ["index.ts", "../flowExecutions/queries.ts", "../flowExecutions/failureKind.ts"]) {
	test(`${entry} loads without either scheduler`, async () => {
		const forbidden: string[] = [];
		const result = await Bun.build({
			entrypoints: [new URL(entry, import.meta.url).pathname],
			target: "bun",
			packages: "external",
			plugins: [
				{
					name: "forbid-schedulers",
					setup(build) {
						build.onResolve({ filter: /nativeFlow|langflow/i }, (args) => {
							forbidden.push(args.path);
							throw new Error(`History imports a scheduler: ${args.path}`);
						});
					},
				},
			],
		});
		expect(forbidden).toEqual([]);
		expect(result.success).toBe(true);
	});
}
