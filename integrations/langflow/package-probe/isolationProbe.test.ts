import { expect, test } from "bun:test";

test("macOS denies the forbidden file and network after environment removal", () => {
	const python = process.env.LANGFLOW_PYTHON;
	if (python === undefined) {
		throw new Error("LANGFLOW_PYTHON must name the retained candidate interpreter.");
	}
	const result = Bun.spawnSync([python, new URL("./isolation/run.py", import.meta.url).pathname, "--python", python]);
	expect(result.exitCode).toBe(0);
	const evidence = JSON.parse(result.stdout.toString());
	expect(evidence.unconfinedWithSecretEnvironmentRemoved).toEqual({
		allowedReadWrite: true,
		forbiddenRead: true,
		networkConnect: true,
		secretEnvironmentPresent: false,
	});
	expect(evidence.macosSandboxWithSecretEnvironmentRemoved).toEqual({
		allowedReadWrite: true,
		forbiddenRead: false,
		networkConnect: false,
		secretEnvironmentPresent: false,
	});
});
