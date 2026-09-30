import { stagePackages } from "../packageClosure";

export const stageHostPackages = (repo: string, target: string) =>
	stagePackages(
		repo,
		target,
		["apps/server", "packages/api", "packages/cli", "apps/runtime", "packages/runtime-protocol"],
		[
			"apps/server/src/index.ts",
			"apps/server/src/db/worker.ts",
			"apps/server/src/services/usage/reportWorker/entry.ts",
		],
	);
