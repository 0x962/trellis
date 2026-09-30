import { expect, test } from "bun:test";
import { mkdir, realpath, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tempDirs } from "../../../tempDir";
import type { ServiceCtx } from "../../support";
import type { LaunchRun } from "../queries";
import { withNativeLaunchScope } from "./withNativeLaunchScope";

const temporary = tempDirs();

async function fixture() {
	const home = await realpath(await temporary("trellis-native-writer-scopes-"));
	const profile = join(home, "profile");
	const common = join(home, "common.git");
	const input = {
		run: { id: "run-original", accountId: null, workspaceId: home } as LaunchRun,
		config: {
			directory: home, accountId: null,
			harness: { preset: "codex" as const, startCommand: "unused", resumeCommand: "unused" },
		},
		resume: false,
		attempt: { id: "attempt-original" },
	};
	const deps = {
		env: { HOME: home, CODEX_HOME: profile },
		workspace: async () => home,
		commonDirectory: async () => common,
	};
	return { home, profile, common, input, deps, ctx: { home } as ServiceCtx };
}

test("a new native launch retains its actual held writer scopes", async () => {
	const f = await fixture();
	await withNativeLaunchScope(f.ctx, f.input, f.deps, async ({ writerScopes, capture }) => {
		expect(writerScopes).toContainEqual({ kind: "workspace", directory: f.home });
		expect(writerScopes).toContainEqual({ kind: "repository", directory: f.common });
		expect(writerScopes).toContainEqual({ kind: "provider", directory: f.profile });
		for (const directory of capture!.providerScopePaths)
			expect(writerScopes).toContainEqual({ kind: "provider", directory });
		expect(writerScopes!.every((scope) => ["workspace", "provider", "repository"].includes(scope.kind))).toBe(true);
	});
});

test("a historical native launch does not acquire reconstructed writer metadata", async () => {
	const f = await fixture();
	const directory = join(f.home, "harness-attempts", f.input.attempt.id);
	await mkdir(directory, { recursive: true });
	await writeFile(join(directory, "launch.json"), JSON.stringify({
		harness: "codex", spec: { id: f.input.attempt.id },
	}));
	await withNativeLaunchScope(f.ctx, f.input, f.deps, async ({ writerScopes, capture }) => {
		expect(writerScopes).toBeUndefined();
		expect(capture).toBeUndefined();
	});
});

test("a custom command keeps its unknown provider scope explicit", async () => {
	const f = await fixture();
	const input = { ...f.input, config: {
		...f.input.config, harness: { preset: "custom" as const, startCommand: "unused", resumeCommand: "unused" },
	} };
	await withNativeLaunchScope(f.ctx, input, f.deps, async ({ writerScopes, capture }) => {
		expect(writerScopes).toBeUndefined();
		expect(capture).toBeUndefined();
	});
});
