import { parseArgs } from "node:util";
import { importHome } from "./importHome.ts";
import { preview } from "./preview.ts";
import { rollback } from "./rollback.ts";

const main = async () => {
	const { values, positionals } = parseArgs({
		args: process.argv.slice(2),
		allowPositionals: true,
		options: {
			source: { type: "string" },
			target: { type: "string" },
			archive: { type: "string" },
			"expected-version": { type: "string" },
		},
	});
	const operation = positionals[0];
	if (!values.target) throw new Error("Supply --target with an explicit data home.");
	if (operation === "rollback") {
		if (!values.archive) throw new Error("Supply --archive with an unused archive path.");
		return rollback({ target: values.target, archive: values.archive });
	}
	if (!values.source) throw new Error("Supply --source with a stopped Trellis data home.");
	if (operation === "preview") return preview({ source: values.source, target: values.target });
	if (operation === "import") {
		if (!values["expected-version"]) throw new Error("Supply --expected-version from the import preview.");
		return importHome({ source: values.source, target: values.target, expectedVersion: values["expected-version"] });
	}
	throw new Error("Use preview, import, or rollback.");
};
if (import.meta.main) {
	try {
		await Bun.write(Bun.stdout, `${JSON.stringify(await main())}\n`);
	} catch (error) {
		await Bun.write(Bun.stderr, `${(error as Error).message}\n`);
		process.exitCode = 1;
	}
}
