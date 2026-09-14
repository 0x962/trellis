import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { runHomeMaintenance } from "../../../../src/homeImportClient/homeImportClient.ts";

test("maintenance passes selected paths as literal arguments and preserves errors", async () => {
	const resources = await mkdtemp("/tmp/trl-maintenance-");
	try {
		await mkdir(join(resources, "bin"));
		await mkdir(join(resources, "apps/server/src/homeImport"), { recursive: true });
		await symlink(process.execPath, join(resources, "bin/bun"));
		const entry = join(resources, "apps/server/src/homeImport/entry.ts");
		await writeFile(entry, "console.log(JSON.stringify({received:process.argv.slice(2)}));");
		const source = "/tmp/a source with 'quotes' and $(text)";
		const request = {
			operation: "import" as const,
			source,
			target: "/tmp/selected target",
			expectedVersion: "reviewed-version",
		};
		const result = (await runHomeMaintenance(resources, request)) as unknown as { received: string[] };
		expect(result.received).toEqual([
			"import",
			"--source",
			source,
			"--target",
			request.target,
			"--expected-version",
			request.expectedVersion,
		]);
		await writeFile(entry, 'process.stderr.write("The source home is locked.\\n");process.exit(2);');
		await expect(runHomeMaintenance(resources, request)).rejects.toThrow("The source home is locked.");
	} finally {
		await rm(resources, { recursive: true, force: true });
	}
});
