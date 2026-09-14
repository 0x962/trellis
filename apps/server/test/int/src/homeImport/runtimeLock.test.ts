import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { preview } from "../../../../src/homeImport/preview.ts";
import { lockHome } from "../../../../src/homeLock.ts";

test("a live runtime lock refuses copy after the host releases its lock", async () => {
	const root = await mkdtemp(join(tmpdir(), "trellis-import-runtime-"));
	const source = join(root, "source");
	await mkdir(join(source, "db"), { recursive: true });
	await mkdir(join(source, "runtime"));
	await writeFile(join(source, "db", "PG_VERSION"), "16");
	lockHome(source, "restore", null).release();
	const ownerBefore = await readFile(join(source, "trellis.lock"), "utf8");
	const script = `import {dlopen,FFIType} from 'bun:ffi'; import {openSync,writeFileSync} from 'node:fs'; const fd=openSync(process.argv[1],'a'); const {symbols}=dlopen(process.platform==='darwin'?'libSystem.B.dylib':'libc.so.6',{flock:{args:[FFIType.i32,FFIType.i32],returns:FFIType.i32}}); if(symbols.flock(fd,6)!==0)process.exit(2); writeFileSync(process.argv[2],'locked'); setInterval(()=>{},1000);`;
	const child = Bun.spawn(
		[process.execPath, "-e", script, join(source, "runtime", "runtime.lock"), join(root, "ready")],
		{
			stdout: "pipe",
			stderr: "pipe",
		},
	);
	try {
		const deadline = Date.now() + 5000;
		while (!(await Bun.file(join(root, "ready")).exists()) && Date.now() < deadline) await Bun.sleep(5);
		expect(await readFile(join(root, "ready"), "utf8")).toBe("locked");
		await expect(preview({ source, target: join(root, "target") })).rejects.toThrow("runtime.lock");
		expect(await readFile(join(source, "trellis.lock"), "utf8")).toBe(ownerBefore);
	} finally {
		child.kill("SIGKILL");
		await child.exited;
		await rm(root, { recursive: true, force: true });
	}
});
