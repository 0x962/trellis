export type PrKind = "frontend" | "backend" | "mixed";
export type PrPathGroup = "risk" | "behavior" | "tests" | "noise";
export type PrRiskAnswer = "yes" | "no";

export type PrPath = {
	path: string;
	type: "change" | "new" | "deleted" | "rename-pure" | "rename-changed";
};

export type PrPathResult = {
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
	publicApiRoot: RegExp;
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
		publicApiRoot: /$^/,
	},
	canary: {},
	trellis: {
		frontendRoot: /^(apps\/web|packages\/ui)\//,
		migrationFolder: /(^|\/)(drizzle|migrations?)(\/|[._-])/,
		dependencyManifest: /(^|\/)(bun\.lockb?|package(-lock)?\.json|pnpm-lock\.yaml|yarn\.lock)$/,
		sharedTypeRoot: /^packages\/api\//,
		publicApiRoot: /^packages\/api\//,
	},
} satisfies Record<string, Partial<Rules>>;

const answer = (value: boolean): PrRiskAnswer => (value ? "yes" : "no");

export function prPaths(repo: string, paths: PrPath[]): PrPathResult {
	const override = repositoryRules[repo.toLowerCase() as keyof typeof repositoryRules];
	const rules: Rules = { ...repositoryRules.default, ...override };
	const facts = paths.map((entry) => {
		const path = entry.path.replace(/^\.\//, "").toLowerCase();
		const test = testPath.test(path);
		return {
			path: entry.path,
			frontend: rules.frontendRoot.test(path),
			auth: authPath.test(path),
			migration: rules.migrationFolder.test(path),
			dependency: rules.dependencyManifest.test(path),
			sharedType: sharedTypePath.test(path) || rules.sharedTypeRoot.test(path),
			publicApi: publicApiPath.test(path) || rules.publicApiRoot.test(path),
			secret: secretPath.test(path),
			test,
			deletedTest: entry.type === "deleted" && test,
			noise: noisePath.test(path),
		};
	});
	const frontend = facts.filter((fact) => fact.frontend).length;
	const groups = Object.fromEntries(
		facts.map((fact): [string, PrPathGroup] => [
			fact.path,
			fact.deletedTest
				? "risk"
				: fact.noise
					? "noise"
					: fact.auth || fact.migration || fact.dependency || fact.sharedType || fact.publicApi || fact.secret
						? "risk"
						: fact.test
							? "tests"
							: "behavior",
		]),
	);
	return {
		kind: frontend === 0 ? "backend" : frontend === facts.length ? "frontend" : "mixed",
		risk: {
			auth: answer(facts.some((fact) => fact.auth)),
			migration: answer(facts.some((fact) => fact.migration)),
			dependency: answer(facts.some((fact) => fact.dependency)),
			sharedType: answer(facts.some((fact) => fact.sharedType)),
			deletedTest: answer(facts.some((fact) => fact.deletedTest)),
		},
		groups,
	};
}
