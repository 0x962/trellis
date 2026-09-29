import { constants } from "node:fs";
import { chmod, copyFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { canonicalBytes } from "../canonicalBytes";
import { inspectPackage } from "../inspectPackage";

export async function sealPackage(input: { staging: string; recipe: unknown; output: string }) {
	const staging = resolve(input.staging);
	const output = resolve(input.output);
	const distance = relative(staging, output);
	if (distance === "" || (!distance.startsWith("../") && distance !== "..")) throw new Error("package_nested_output");
	const inspected = await inspectPackage(staging, input.recipe);
	await mkdir(output, { mode: 0o700 });
	const payload = join(output, "payload");
	await mkdir(payload, { mode: 0o700 });
	for (const file of inspected.files) {
		const destination = join(payload, file.path);
		await mkdir(dirname(destination), { recursive: true, mode: 0o700 });
		await copyFile(join(staging, file.path), destination, constants.COPYFILE_EXCL);
		await chmod(destination, 0o600);
	}
	const copied = await inspectPackage(payload, inspected.recipe);
	if (copied.packageId !== inspected.packageId) throw new Error("package_changed_during_copy");
	await writeFile(join(output, "package.json"), `${canonicalBytes(copied)}\n`, { flag: "wx", mode: 0o600 });
	return copied;
}
