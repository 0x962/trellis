import { readFile } from "node:fs/promises";
import { sealPackage } from "../sealPackage";
import { verifyPackage } from "../verifyPackage";

const [command, root, argument, output] = process.argv.slice(2);
if (command === "seal" && root && argument && output && process.argv.length === 6) {
	const result = await sealPackage({ staging: root, recipe: JSON.parse(await readFile(argument, "utf8")), output });
	console.log(result.packageId);
} else if (command === "verify" && root && argument && process.argv.length === 5) {
	const result = await verifyPackage(root, argument);
	console.log(result.packageId);
} else {
	throw new Error("Usage: cli.ts seal STAGING RECIPE OUTPUT | verify PACKAGE EXPECTED_SHA256");
}
