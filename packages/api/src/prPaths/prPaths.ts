export type PrKind = "frontend" | "backend" | "mixed";
export type PrPathGroup = "risk" | "behavior" | "tests" | "noise";
export type PrRiskAnswer = "yes" | "no";
export type PrChangeType = "change" | "new" | "deleted" | "rename-pure" | "rename-changed";

// `change` describes how Git changed the file. Only a deleted test file changes classification.
export type PrPath = {
	path: string;
	change: PrChangeType;
};

export type PrPathFacts = {
	kind: PrKind;
	risk: {
		auth: PrRiskAnswer;
		migration: PrRiskAnswer;
		dependency: PrRiskAnswer;
		sharedType: PrRiskAnswer;
		deletedTest: PrRiskAnswer;
	};
	groups: Record<string, PrPathGroup>;
};

type Rules = {
	frontendRoot: RegExp;
	migrationFolder: RegExp;
	dependencyManifest: RegExp;
	sharedTypeRoot: RegExp;
};

const authPath = /(^|\/)(auth|authentication|authorization|permissions?|rbac|tenancy|private)(\/|[._-])/;
const sharedTypePath = /(^|\/)(types?|schemas?|contracts?)(\/|[._-])|\.d\.ts$/;
const publicApiPath = /(^|\/)(api|openapi|routes?|urls?|procedures?)(\/|[._-])/;
const secretPath =
	/(^|\/|[._-])(secrets?|credentials?|tokens?|api[_-]?keys?|private[_-]?keys?)(\/|[._-])|(^|\/)\.env($|\.)|\.(pem|key)$/;
const testPath =
	/(^|\/)(__tests__|tests?)(\/|[._-])|(^|\/)(test_[^/]+|[^/]+_(test|spec))\.[^/]+$|\.(test|spec)\.[^/]+$/;
const noisePath =
	/(^|\/)(node_modules|__snapshots__|generated)(\/|$)|^(dist|build|coverage)\/|^(apps|packages)\/[^/]+\/(dist|build|coverage)\/|\.(gen|generated)\.|\.snap$|(^|\/)(bun\.lockb?|package-lock\.json|pnpm-lock\.yaml|yarn\.lock|poetry\.lock|pdm\.lock|uv\.lock|cargo\.lock|go\.sum|gemfile\.lock|composer\.lock|pubspec\.lock)$/;

const repositoryRules = {
	default: {
		frontendRoot: /^frontend\//,
		migrationFolder: /(^|\/)(migrations?)(\/|[._-])/,
		dependencyManifest:
			/(^|\/)(bun\.lockb?|package(-lock)?\.json|pnpm-lock\.yaml|yarn\.lock|deno\.jsonc?|pyproject\.toml|poetry\.lock|requirements[^/]*\.txt|pdm\.lock|uv\.lock|cargo\.toml|cargo\.lock|go\.mod|go\.sum|gemfile(\.lock)?|composer\.json|composer\.lock|pubspec\.yaml|pubspec\.lock)$/,
		sharedTypeRoot: /$^/,
	},
	canary: {},
	trellis: {
		frontendRoot: /^(apps\/web|packages\/ui)\//,
		migrationFolder: /(^|\/)(drizzle|migrations?)(\/|[._-])/,
		dependencyManifest: /(^|\/)(bun\.lockb?|package(-lock)?\.json|pnpm-lock\.yaml|yarn\.lock)$/,
		sharedTypeRoot: /^packages\/api\//,
	},
} satisfies Record<string, Partial<Rules>>;

const yesNo = (value: boolean): PrRiskAnswer => (value ? "yes" : "no");

// The path list contains at least one changed file. A caller with no file data keeps its pull request kind unknown.
export function prPaths(repo: string, paths: PrPath[]): PrPathFacts {
	const override = repositoryRules[repo.toLowerCase() as keyof typeof repositoryRules];
	const rules: Rules = { ...repositoryRules.default, ...override };
	const facts = paths.map((entry) => {
		const path = entry.path.replace(/^\.\//, "").toLowerCase();
		const isTestFile = testPath.test(path);
		return {
			path: entry.path,
			frontend: rules.frontendRoot.test(path),
			auth: !isTestFile && authPath.test(path),
			migration: !isTestFile && rules.migrationFolder.test(path),
			dependency: !isTestFile && rules.dependencyManifest.test(path),
			sharedType: !isTestFile && (sharedTypePath.test(path) || rules.sharedTypeRoot.test(path)),
			publicApi: !isTestFile && publicApiPath.test(path),
			secret: !isTestFile && secretPath.test(path),
			isTestFile,
			deletedTest: entry.change === "deleted" && isTestFile,
			noise: noisePath.test(path),
		};
	});
	const frontendCount = facts.filter((fact) => fact.frontend).length;
	// A path can match more than one rule. A deleted test file gets `risk` before a noise match.
	// A noise match gets `noise` before an ordinary test file gets `tests`.
	// The risk answers still report an auth or migration match on a noise path.
	const groups = Object.fromEntries(
		facts.map((fact): [string, PrPathGroup] => [
			fact.path,
			fact.deletedTest
				? "risk"
				: fact.noise
					? "noise"
					: fact.isTestFile
						? "tests"
						: fact.auth || fact.migration || fact.dependency || fact.sharedType || fact.publicApi || fact.secret
							? "risk"
							: "behavior",
		]),
	);
	return {
		kind: frontendCount === 0 ? "backend" : frontendCount === facts.length ? "frontend" : "mixed",
		risk: {
			auth: yesNo(facts.some((fact) => fact.auth)),
			migration: yesNo(facts.some((fact) => fact.migration)),
			dependency: yesNo(facts.some((fact) => fact.dependency)),
			sharedType: yesNo(facts.some((fact) => fact.sharedType)),
			deletedTest: yesNo(facts.some((fact) => fact.deletedTest)),
		},
		groups,
	};
}
