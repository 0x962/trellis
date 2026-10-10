const testDirectory = /(^|\/)(__tests__|tests?)(\/|$)/;
const testFile = /(^|\/)(test_[^/]+|[^/]+_(test|spec))\.[^/]+$|\.(test|spec)\.[^/]+$/;
const fixturePath = /(^|\/)(__fixtures__|fixtures?)(\/|$)|\.fixture\.[^/]+$/;
const snapshotPath = /(^|\/)__snapshots__(\/|$)|\.snap$/;
const storyPath = /\.(stories|story)\.[^/]+$/;
const documentName =
	/(^|\/)(readme|license|notice|changelog|contributing|code_of_conduct|security)(\.(mdx?|rst|adoc|asciidoc))?$/;
const lockFile =
	/(^|\/)(bun\.lockb?|package-lock\.json|pnpm-lock\.yaml|yarn\.lock|poetry\.lock|pdm\.lock|pipfile\.lock|uv\.lock|cargo\.lock|go\.sum|gemfile\.lock|composer\.lock|pubspec\.lock|flake\.lock)$/;
const buildDirectory = /^(dist|coverage|out|\.next|\.nuxt|\.turbo)$/;
const documentDirectory = /^(docs|documentation)$/;
const documentFile = /\.(avif|gif|jpe?g|mdx?|pdf|png|rst|adoc|asciidoc|svg|webp)$/;

const isBuildOutput = (parts: string[]): boolean =>
	parts.some((part) => buildDirectory.test(part) || part === "node_modules");

const isDocumentation = (path: string, parts: string[]): boolean =>
	documentName.test(path) || (parts.some((part) => documentDirectory.test(part)) && documentFile.test(path));

export function reviewFilePaths(paths: string[]): string[] {
	const seen = new Set<string>();
	return paths.filter((rawPath) => {
		const path = rawPath.replace(/^\.\//, "");
		if (seen.has(path)) return false;
		seen.add(path);
		const lower = path.toLowerCase();
		const parts = lower.split("/");
		if (
			testDirectory.test(lower) ||
			testFile.test(lower) ||
			fixturePath.test(lower) ||
			snapshotPath.test(lower) ||
			storyPath.test(lower) ||
			isDocumentation(lower, parts) ||
			lockFile.test(lower) ||
			isBuildOutput(parts)
		)
			return false;
		return true;
	});
}
