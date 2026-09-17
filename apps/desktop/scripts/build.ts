import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
await mkdir(resolve(root, "dist"), { recursive: true });
for (const name of ["main", "preload", "host-service"]) {
	const result = await Bun.build({
		entrypoints: [resolve(root, `src/${name}.ts`)],
		outdir: resolve(root, "dist"),
		naming: `${name}.cjs`,
		target: "node",
		format: "cjs",
		external: ["electron"],
	});
	if (!result.success) throw new AggregateError(result.logs, `Could not build ${name}.`);
}

const template = await readFile(resolve(root, "../../packages/ui/src/desktopStartup/desktopStartup.html"), "utf8");
const tokens = await readFile(resolve(root, "../../packages/ui/src/tokens.css"), "utf8");
const script = template.match(/<script>([\s\S]*?)<\/script>/)![1]!;
await writeFile(
	resolve(root, "dist/startup.html"),
	template
		.replace("/* __TOKENS__ */", tokens)
		.replace("__SCRIPT_HASH__", createHash("sha256").update(script).digest("base64")),
);

const swift = Bun.spawn(
	[
		"xcrun",
		"swiftc",
		"-target",
		`${process.arch === "arm64" ? "arm64" : "x86_64"}-apple-macos13`,
		resolve(root, "native/TrellisHost.swift"),
		"-o",
		resolve(root, "dist/TrellisHost"),
	],
	{ stdout: "inherit", stderr: "inherit" },
);
if (await swift.exited) throw new Error("Could not compile the macOS service helper.");
