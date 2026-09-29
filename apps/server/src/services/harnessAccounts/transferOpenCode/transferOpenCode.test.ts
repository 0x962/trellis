import { afterEach, expect, test } from "bun:test";
import { createReadStream, existsSync } from "node:fs";
import { chmod, mkdir, mkdtemp, open, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { transferSession } from "../transferSession";

const roots: string[] = [];
const sessionId = "ses_transfer";

afterEach(async () => {
	await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixture(mode = "complete") {
	const root = await mkdtemp(join(tmpdir(), "trellis-transfer-test-"));
	roots.push(root);
	const from = join(root, "from");
	const to = join(root, "to");
	const bin = join(root, "bin");
	await Promise.all([from, to, bin].map((path) => mkdir(path)));
	const source = join(from, "conversation.json");
	await writeFile(source, JSON.stringify({ info: { id: sessionId }, messages: [{ text: "Original conversation" }] }));
	await writeFile(join(from, "auth.json"), "source credentials");
	await writeFile(join(to, "auth.json"), "target credentials");
	const executable = join(bin, "opencode");
	await writeFile(
		executable,
		`#!${process.execPath}
import { createReadStream } from "node:fs";
import { copyFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
const [command, argument] = process.argv.slice(2);
const profile = process.env.XDG_DATA_HOME;
const mode = process.env.TRANSFER_CASE;
if (command === "export") {
	await pipeline(createReadStream(join(profile, "conversation.json")), process.stdout);
	if (mode === "export-failure") {
		process.stderr.write("export failed after output");
		process.exitCode = 9;
	}
	if (mode === "export-timeout") {
		process.on("SIGTERM", () => process.exit(0));
		setInterval(() => {}, 1000);
	}
} else {
	await writeFile(join(profile, "import-called"), argument);
	if (mode !== "import-failure") await copyFile(argument, join(profile, "conversation.json"));
	if (mode === "large") {
		for (let i = 0; i < 17; i++) {
			await new Promise((resolve) => process.stdout.write("x".repeat(65536), resolve));
			await new Promise((resolve) => process.stderr.write("e".repeat(65536), resolve));
		}
		await new Promise((resolve) => process.stdout.write("x".repeat(65530), resolve));
	}
	if (mode !== "no-confirmation") process.stdout.write("Imported session: ${sessionId}\\n");
	if (mode === "import-failure") {
		process.stderr.write("import failed after confirmation");
		process.exitCode = 7;
	}
}
`,
	);
	await chmod(executable, 0o700);
	return {
		source,
		input: {
			harness: "opencode" as const,
			from,
			to,
			sessionId,
			cwd: root,
			directory: join(root, "transfer"),
			env: { PATH: bin, TRANSFER_CASE: mode },
		},
	};
}

async function digest(path: string) {
	const hasher = new Bun.CryptoHasher("sha256");
	for await (const chunk of createReadStream(path)) hasher.update(chunk);
	return hasher.digest("hex");
}

test("transfers an export above 64 MiB and import output above 1 MiB without changing the source", async () => {
	const { source, input } = await fixture("large");
	const file = await open(source, "w");
	try {
		await file.write(`{"info":{"id":"${sessionId}"},"messages":[{"text":"`);
		const chunk = "x".repeat(1024 * 1024);
		for (let i = 0; i < 65; i++) await file.write(chunk);
		await file.write('tail-終わり"}]}');
	} finally {
		await file.close();
	}
	const original = await digest(source);
	await transferSession(input);
	expect((await stat(source)).size).toBeGreaterThan(64 * 1024 * 1024);
	expect(await digest(source)).toBe(original);
	expect(await digest(join(input.to, "conversation.json"))).toBe(original);
	expect(await digest(join(input.directory, "session.json"))).toBe(original);
	for (const path of ["import.stdout", "import.stdout.stderr"]) {
		expect((await stat(join(input.directory, path))).size).toBeGreaterThan(1024 * 1024);
		expect((await stat(join(input.directory, path))).mode & 0o777).toBe(0o600);
	}
	expect((await stat(join(input.directory, "session.json"))).mode & 0o777).toBe(0o600);
	expect((await stat(input.directory)).mode & 0o777).toBe(0o700);
	expect(await readFile(join(input.from, "auth.json"), "utf8")).toBe("source credentials");
	expect(await readFile(join(input.to, "auth.json"), "utf8")).toBe("target credentials");
}, 30000);

for (const [name, bytes] of [
	["incomplete JSON", '{"info":{"id":"ses_transfer"},"messages":['],
	["invalid export shape", '{"info":{"id":"ses_transfer"}}'],
	["different session", '{"info":{"id":"ses_other"},"messages":[]}'],
] as const) {
	test(`rejects ${name} before import and preserves the source`, async () => {
		const { source, input } = await fixture();
		await writeFile(source, bytes);
		await writeFile(join(input.to, "conversation.json"), "Existing target conversation");
		await expect(transferSession(input)).rejects.toThrow();
		expect(existsSync(join(input.to, "import-called"))).toBe(false);
		expect(await readFile(join(input.to, "conversation.json"), "utf8")).toBe("Existing target conversation");
		expect(await readFile(source, "utf8")).toBe(bytes);
	});
}

test("rejects a failed export even when its output is complete JSON", async () => {
	const { source, input } = await fixture("export-failure");
	const original = await digest(source);
	await expect(transferSession(input)).rejects.toThrow("OpenCode export failed (9)");
	expect(existsSync(join(input.to, "import-called"))).toBe(false);
	expect(await digest(source)).toBe(original);
	expect(await readFile(join(input.directory, "session.json.stderr"), "utf8")).toBe("export failed after output");
});

test("rejects a failed import even when it prints a confirmation", async () => {
	const { source, input } = await fixture("import-failure");
	const original = await digest(source);
	await expect(transferSession(input)).rejects.toThrow("OpenCode import failed (7)");
	expect(await digest(source)).toBe(original);
	expect(await readFile(join(input.directory, "import.stdout.stderr"), "utf8")).toBe(
		"import failed after confirmation",
	);
});

test("requires import confirmation", async () => {
	const { input } = await fixture("no-confirmation");
	await expect(transferSession(input)).rejects.toThrow("OpenCode did not confirm the imported session.");
});

test("reports an unavailable executable without import", async () => {
	const { input } = await fixture();
	await rm(join(input.cwd, "bin", "opencode"));
	await expect(transferSession(input)).rejects.toThrow();
	expect(existsSync(join(input.to, "import-called"))).toBe(false);
});

test("rejects the export timeout even when the subprocess handles SIGTERM with exit zero", async () => {
	const { source, input } = await fixture("export-timeout");
	const original = await digest(source);
	const started = Date.now();
	await expect(transferSession(input)).rejects.toThrow("OpenCode export failed (timeout)");
	expect(Date.now() - started).toBeGreaterThanOrEqual(30000);
	expect(existsSync(join(input.to, "import-called"))).toBe(false);
	expect(await digest(source)).toBe(original);
}, 40000);
