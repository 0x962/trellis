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
	frontend: RegExp;
	auth: RegExp;
	migration: RegExp;
	dependency: RegExp;
	sharedType: RegExp;
	publicApi: RegExp;
	secret: RegExp;
	test: RegExp;
	noise: RegExp;
};

const repositoryRules: Record<string, Rules> = {
	default: {
		frontend: /^frontend\//,
		auth: /(^|\/)(auth|authentication|authorization|permissions?|rbac|tenancy|private)(\/|[._-])/,
		migration: /(^|\/)(drizzle|migrations?)(\/|[._-])/,
		dependency:
			/(^|\/)(bun\.lockb?|package(-lock)?\.json|pnpm-lock\.yaml|yarn\.lock|deno\.jsonc?|pyproject\.toml|poetry\.lock|requirements[^/]*\.txt|pdm\.lock|uv\.lock|cargo\.toml|cargo\.lock|go\.mod|go\.sum|gemfile(\.lock)?|composer\.json|composer\.lock|pubspec\.yaml|pubspec\.lock)$/,
		sharedType: /(^|\/)(types?|schemas?|contracts?)(\/|[._-])|\.d\.ts$/,
		publicApi: /(^|\/)(api|openapi|routes?|urls?|procedures?)(\/|[._-])/,
		secret:
			/(^|\/|[._-])(secrets?|credentials?|tokens?|api[_-]?keys?|private[_-]?keys?)(\/|[._-])|(^|\/)\.env($|\.)|\.(pem|key)$/,
		test: /(^|\/)(__tests__|tests?)(\/|[._-])|(^|\/)(test_[^/]+|[^/]+_(test|spec))\.[^/]+$|\.(test|spec)\.[^/]+$/,
		noise:
			/(^|\/)(generated|dist|build|coverage|__snapshots__)(\/|$)|\.(gen|generated)\.|\.snap$|(^|\/)(bun\.lockb?|package-lock\.json|pnpm-lock\.yaml|yarn\.lock|poetry\.lock|pdm\.lock|uv\.lock|cargo\.lock|go\.sum|gemfile\.lock|composer\.lock|pubspec\.lock)$/,
	},
	canary: {
		frontend: /^frontend\//,
		auth: /(^|\/)(auth|authentication|authorization|permissions?|rbac|tenancy|private)(\/|[._-])/,
		migration: /(^|\/)(migrations?)(\/|[._-])/,
		dependency:
			/(^|\/)(package(-lock)?\.json|pnpm-lock\.yaml|yarn\.lock|pyproject\.toml|poetry\.lock|requirements[^/]*\.txt|pdm\.lock|uv\.lock)$/,
		sharedType: /(^|\/)(types?|schemas?|contracts?)(\/|[._-])|\.d\.ts$/,
		publicApi: /(^|\/)(api|openapi|routes?|urls?)(\/|[._-])/,
		secret:
			/(^|\/|[._-])(secrets?|credentials?|tokens?|api[_-]?keys?|private[_-]?keys?)(\/|[._-])|(^|\/)\.env($|\.)|\.(pem|key)$/,
		test: /(^|\/)(__tests__|tests?)(\/|[._-])|(^|\/)(test_[^/]+|[^/]+_(test|spec))\.[^/]+$|\.(test|spec)\.[^/]+$/,
		noise:
			/(^|\/)(generated|dist|build|coverage|__snapshots__)(\/|$)|\.(gen|generated)\.|\.snap$|(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|poetry\.lock|pdm\.lock|uv\.lock)$/,
	},
	trellis: {
		frontend: /^(apps\/web|packages\/ui)\//,
		auth: /(^|\/)(auth|authentication|authorization|permissions?|rbac|tenancy|private)(\/|[._-])/,
		migration: /(^|\/)(drizzle|migrations?)(\/|[._-])/,
		dependency: /(^|\/)(bun\.lockb?|package(-lock)?\.json|pnpm-lock\.yaml|yarn\.lock)$/,
		sharedType: /^packages\/api\/|(^|\/)(types?|schemas?|contracts?)(\/|[._-])|\.d\.ts$/,
		publicApi: /^packages\/api\/|(^|\/)(api|openapi|routes?|procedures?)(\/|[._-])/,
		secret:
			/(^|\/|[._-])(secrets?|credentials?|tokens?|api[_-]?keys?|private[_-]?keys?)(\/|[._-])|(^|\/)\.env($|\.)|\.(pem|key)$/,
		test: /(^|\/)(__tests__|tests?)(\/|[._-])|(^|\/)(test_[^/]+|[^/]+_(test|spec))\.[^/]+$|\.(test|spec)\.[^/]+$/,
		noise:
			/(^|\/)(generated|dist|build|coverage|__snapshots__)(\/|$)|\.(gen|generated)\.|\.snap$|(^|\/)(bun\.lockb?|package-lock\.json|pnpm-lock\.yaml|yarn\.lock)$/,
	},
};

const answer = (value: boolean): PrRiskAnswer => (value ? "yes" : "no");

export function prPaths(repo: string, paths: PrPath[]): PrPathResult {
	const rules = repositoryRules[repo.toLowerCase()] ?? repositoryRules.default!;
	const facts = paths.map((entry) => {
		const path = entry.path.replace(/^\.\//, "").toLowerCase();
		const test = rules.test.test(path);
		return {
			path: entry.path,
			frontend: rules.frontend.test(path),
			auth: rules.auth.test(path),
			migration: rules.migration.test(path),
			dependency: rules.dependency.test(path),
			sharedType: rules.sharedType.test(path),
			publicApi: rules.publicApi.test(path),
			secret: rules.secret.test(path),
			test,
			deletedTest: entry.type === "deleted" && test,
			noise: rules.noise.test(path),
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
