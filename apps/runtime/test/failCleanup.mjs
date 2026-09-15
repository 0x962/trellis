import { registerHooks } from "node:module";

const source = `
import { existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import * as koffi from ${JSON.stringify(import.meta.resolve("koffi"))};
export * from ${JSON.stringify(import.meta.resolve("koffi"))};
export function load(...args) {
	const library = koffi.load(...args);
	const bind = library.func.bind(library);
	const func = function (signature) {
		const native = bind(signature);
		if (!signature.includes("proc_pidinfo(")) return native;
		return function (...parameters) {
			const marker = join(process.argv.at(-1), "fail-cleanup");
			if (parameters[1] === 13 && existsSync(marker)) {
				unlinkSync(marker);
				throw new Error("Native process snapshot failed");
			}
			return native(...parameters);
		};
	};
	return { func };
}
`;
const url = `data:text/javascript,${encodeURIComponent(source)}`;
registerHooks({
	resolve(specifier, context, nextResolve) {
		return specifier === "koffi" ? { url, shortCircuit: true } : nextResolve(specifier, context);
	},
});
