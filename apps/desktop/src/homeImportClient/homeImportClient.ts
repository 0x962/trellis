import { execFile } from "node:child_process";
import { join } from "node:path";
import { promisify } from "node:util";

export type HomeImportPreview = {
	source: string;
	target: string;
	version: string;
	files: number;
	bytes: number;
	counts: { projects: number; tickets: number; agents: number; attachments: number; artifacts: number; checks: number };
	blockers: string[];
	workspaceReferences: { id: string; workspaceId: string | null }[];
};
export type MaintenanceRequest = {
	operation: "preview" | "import";
	source: string;
	target: string;
	expectedVersion?: string;
};
const execute = promisify(execFile);
const entryAt = (resources: string) => join(resources, "apps/server/src/homeImport/entry.ts");

export const runHomeMaintenance = async (
	resources: string,
	request: MaintenanceRequest,
): Promise<HomeImportPreview> => {
	const args = [entryAt(resources), request.operation, "--source", request.source, "--target", request.target];
	if (request.expectedVersion) args.push("--expected-version", request.expectedVersion);
	try {
		const { stdout } = await execute(join(resources, "bin/bun"), args, { maxBuffer: 4 * 1024 * 1024 });
		return JSON.parse(stdout);
	} catch (error) {
		const failure = error as Error & { stderr?: string };
		throw new Error(failure.stderr?.trim() || failure.message);
	}
};

export const rollbackCommand = (resources: string, target: string): string =>
	[
		join(resources, "bin/bun"),
		entryAt(resources),
		"rollback",
		"--target",
		target,
		"--archive",
		`${target}.import-archive-${crypto.randomUUID()}`,
	]
		.map((argument) => `'${argument.replaceAll("'", "'\\''")}'`)
		.join(" ");
