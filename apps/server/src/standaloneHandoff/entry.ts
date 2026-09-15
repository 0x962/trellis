import { parseArgs } from "node:util";
import { prepareStandaloneHandoff } from "./prepare.ts";

const main = async () => {
	const { values } = parseArgs({
		args: process.argv.slice(2),
		options: {
			home: { type: "string" },
			backup: { type: "string" },
			"restore-standalone-service": { type: "boolean" },
		},
	});
	if (!values.home || !values.backup) throw new Error("Supply --home and --backup with the reviewed paths.");
	return prepareStandaloneHandoff({
		home: values.home,
		backupPath: values.backup,
		restoreStandaloneService: values["restore-standalone-service"],
	});
};

if (import.meta.main) {
	try {
		await Bun.write(Bun.stdout, `${JSON.stringify(await main())}\n`);
	} catch (error) {
		await Bun.write(Bun.stderr, `${(error as Error).message}\n`);
		process.exitCode = 1;
	}
}
