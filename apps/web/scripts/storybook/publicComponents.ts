import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { babelParse } from "storybook/internal/babel";

const resolveSource = (path: string) => {
	const result = [path, `${path}.ts`, `${path}.tsx`, `${path}/index.ts`, `${path}/index.tsx`].find(
		(candidate) => existsSync(candidate) && statSync(candidate).isFile(),
	);
	if (!result) throw new Error(`Cannot resolve UI source: ${path}`);
	return result;
};

export const publicComponents = (path: string): Set<string> => {
	const file = resolveSource(path);
	const ast = babelParse(readFileSync(file, "utf8"));
	const names = new Set<string>();
	for (const node of ast.program.body) {
		if (node.type === "ExportAllDeclaration" && node.exportKind !== "type") {
			for (const name of publicComponents(resolve(dirname(file), node.source.value))) names.add(name);
		}
		if (node.type !== "ExportNamedDeclaration" || node.exportKind === "type") continue;
		for (const specifier of node.specifiers) {
			if (specifier.type !== "ExportSpecifier" || specifier.exportKind === "type") continue;
			const name = specifier.exported.type === "Identifier" ? specifier.exported.name : specifier.exported.value;
			if (/^[A-Z][a-z]/.test(name)) names.add(name);
		}
		const declaration = node.declaration;
		if (declaration?.type === "FunctionDeclaration" && declaration.id) names.add(declaration.id.name);
		if (declaration?.type === "VariableDeclaration") {
			for (const value of declaration.declarations) {
				if (value.id.type === "Identifier" && /^[A-Z][a-z]/.test(value.id.name)) names.add(value.id.name);
			}
		}
	}
	return new Set([...names].filter((name) => /^[A-Z][a-z]/.test(name)));
};
