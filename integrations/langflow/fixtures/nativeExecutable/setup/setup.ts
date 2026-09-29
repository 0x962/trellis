import { mkdir, realpath, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { NativeFixturePlanSchema } from "../plan/plan.ts";

const absolute = z.string().refine(isAbsolute);
const InputSchema = z.strictObject({
	root: absolute,
	bun: absolute,
	plan: NativeFixturePlanSchema,
});
const quote = (text: string) => `'${text.replaceAll("'", "'\\''")}'`;

export async function prepareNativeExecutable(raw: unknown) {
	const input = InputSchema.parse(raw);
	if (process.platform !== "darwin") throw new Error("This fixture requires the macOS network sandbox.");
	if (await realpath(dirname(input.root)) !== await realpath(tmpdir()) || !basename(input.root).startsWith("trellis-"))
		throw new Error("Use a new trellis-prefixed directory directly under TMPDIR.");
	const bun = await realpath(input.bun);
	const source = fileURLToPath(new URL("../", import.meta.url));
	await mkdir(input.root, { mode: 0o700 });
	const root = await realpath(input.root);
	for (const name of ["home", "profile", "bin", "tmp", "evidence", "sessions", "workspace"])
		await mkdir(join(root, name), { mode: 0o700 });
	const privateFile = (name: string, body: string, mode = 0o600) =>
		writeFile(join(root, name), body, { mode, flag: "wx" });
	await privateFile("plan.json", `${JSON.stringify(input.plan)}\n`);
	await privateFile("profile/config.toml", 'model = "deterministic-native-fixture"\n');
	await privateFile("bin/codex", "#!/bin/sh\nexit 78\n", 0o700);
	const policy = join(source, "provider-denial.sb");
	await privateFile("bin/native-fixture", [
		"#!/bin/sh",
		"set -eu",
		`exec /usr/bin/sandbox-exec -f ${quote(policy)} -D RUNTIME_SOCKET="$TRELLIS_HARNESS_SOCKET" -D CONTROL_SOCKET="$TRELLIS_CODEX_CONTROL_SOCKET" ${quote(bun)} "$@"`,
		"",
	].join("\n"), 0o700);
	const environment = {
		HOME: join(root, "home"),
		CODEX_HOME: join(root, "profile"),
		TMPDIR: join(root, "tmp"),
		PATH: `${join(root, "bin")}:/usr/bin:/bin`,
		TRELLIS_CODEX_BRIDGE: join(source, "bridge/bridge.ts"),
		TRELLIS_RUNTIME_NODE: join(root, "bin/native-fixture"),
		TRELLIS_NATIVE_FIXTURE_ROOT: root,
	};
	const result = {
		schemaVersion: 1,
		root,
		bun,
		policy,
		environment,
		accountCreate: { name: "Deterministic native fixture", harness: "codex", profilePath: environment.CODEX_HOME },
		proof: "unexecuted",
	};
	await privateFile("setup.json", `${JSON.stringify(result, null, 2)}\n`);
	return result;
}
