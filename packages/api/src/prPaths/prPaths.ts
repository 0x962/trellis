import type { ChangedFile } from "../schemas/pullRequest.ts";

export type PrPathGroup = "risk" | "behavior" | "tests" | "noise";
export type PrRiskAnswer = "yes" | "no";
export type PrChangeType = ChangedFile["change"];

export type PrPath = {
	path: string;
	change: PrChangeType;
	removedLinesOnly: boolean;
};

// GitHub reports no added line and at least one removed line when a change only removes content.
// For a test file, this means the change removed test cases.
export const changedFilePaths = (files: ChangedFile[]): PrPath[] =>
	files.map((file) => ({
		path: file.path,
		change: file.change,
		removedLinesOnly: file.additions === 0 && file.deletions > 0,
	}));

// Why one path sits in the risk group. The words rank from the reason that
// costs the most when it is wrong to the reason that costs the least.
export const prRiskReasons = [
	"secret",
	"auth",
	"migration",
	"dependency",
	"sharedType",
	"publicApi",
	"deletedTest",
] as const;
export type PrRiskReason = (typeof prRiskReasons)[number];

export type PrPathFacts = {
	risk: {
		auth: PrRiskAnswer;
		migration: PrRiskAnswer;
		dependency: PrRiskAnswer;
		sharedType: PrRiskAnswer;
		deletedTest: PrRiskAnswer;
	};
	groups: Record<string, PrPathGroup>;
	// The reasons of each path, in the order of `prRiskReasons`. A path with no
	// reason holds an empty list.
	reasons: Record<string, PrRiskReason[]>;
};

type Rules = {
	migrationFolder: RegExp;
	dependencyManifest: RegExp;
	sharedTypeRoot: RegExp;
};

const authPath = /(^|\/)(auth|authentication|authorization|permissions?|rbac|tenancy|private)(\/|[._-])/;
const sharedTypePath = /(^|\/)(types?|schemas?|contracts?)(\/|[._-])|\.d\.ts$/;
const publicApiPath = /(^|\/)(api|openapi|routes?|urls?|procedures?)(\/|[._-])/;
const secretPath =
	/(^|\/|[._-])(secrets?|credentials?|tokens?|api[_-]?keys?|private[_-]?keys?)(\/|[._-])|(^|\/)\.env($|\.)|\.(pem|key)$/;
const testPathPattern =
	/(^|\/)(__tests__|tests?)(\/|[._-])|(^|\/)(test_[^/]+|[^/]+_(test|spec))\.[^/]+$|\.(test|spec)\.[^/]+$/;
const noisePath =
	/(^|\/)(node_modules|__snapshots__|generated)(\/|$)|^(dist|build|coverage)\/|^(apps|packages)\/[^/]+\/(dist|build|coverage)\/|\.(gen|generated)\.|\.snap$|(^|\/)(bun\.lockb?|package-lock\.json|pnpm-lock\.yaml|yarn\.lock|poetry\.lock|pdm\.lock|uv\.lock|cargo\.lock|go\.sum|gemfile\.lock|composer\.lock|pubspec\.lock)$/;

const repositoryRules = {
	default: {
		migrationFolder: /(^|\/)(migrations?)(\/|[._-])/,
		dependencyManifest:
			/(^|\/)(bun\.lockb?|package(-lock)?\.json|pnpm-lock\.yaml|yarn\.lock|deno\.jsonc?|pyproject\.toml|poetry\.lock|requirements[^/]*\.txt|pdm\.lock|uv\.lock|cargo\.toml|cargo\.lock|go\.mod|go\.sum|gemfile(\.lock)?|composer\.json|composer\.lock|pubspec\.yaml|pubspec\.lock)$/,
		sharedTypeRoot: /$^/,
	},
	canary: {},
	trellis: {
		migrationFolder: /(^|\/)(drizzle|migrations?)(\/|[._-])/,
		dependencyManifest: /(^|\/)(bun\.lockb?|package(-lock)?\.json|pnpm-lock\.yaml|yarn\.lock)$/,
		sharedTypeRoot: /^packages\/api\//,
	},
} satisfies Record<string, Partial<Rules>>;

const yesNo = (value: boolean): PrRiskAnswer => (value ? "yes" : "no");

export const isTestPath = (path: string): boolean => testPathPattern.test(path.toLowerCase());

const dataModelPath = [
	/(^|\/)migrations\/[^/]+\.py$/,
	/(^|\/)models\.py$/,
	/(^|\/)models\/[^/]+\.py$/,
	/(^|\/)drizzle\/[^/]+\.sql$/,
	/(^|\/)db\/tables\/[^/]+\.ts$/,
	/(^|\/)schema\.prisma$/,
	/(^|\/)migrations?\/[^/]+\.sql$/,
];

export const changesDataModels = (paths: PrPath[]): boolean =>
	paths.some((entry) => {
		const path = entry.path.replace(/^\.\//, "").toLowerCase();
		return dataModelPath.some((pattern) => pattern.test(path));
	});

export const hasMermaidErDiagram = (texts: string[]): boolean =>
	texts.some((text) => {
		for (const match of text.matchAll(/```[ \t]*mermaid[^\r\n]*(?:\r?\n)([\s\S]*?)```/gi)) {
			if (/^\s*erDiagram\b/im.test(match[1] ?? "")) return true;
		}
		return false;
	});

export function prPaths(repo: string, paths: PrPath[]): PrPathFacts {
	const override = repositoryRules[repo.toLowerCase() as keyof typeof repositoryRules];
	const rules: Rules = { ...repositoryRules.default, ...override };
	const facts = paths.map((entry) => {
		const path = entry.path.replace(/^\.\//, "").toLowerCase();
		const isTestFile = isTestPath(path);
		return {
			path: entry.path,
			auth: !isTestFile && authPath.test(path),
			migration: !isTestFile && rules.migrationFolder.test(path),
			dependency: !isTestFile && rules.dependencyManifest.test(path),
			sharedType: !isTestFile && (sharedTypePath.test(path) || rules.sharedTypeRoot.test(path)),
			publicApi: !isTestFile && publicApiPath.test(path),
			secret: !isTestFile && secretPath.test(path),
			isTestFile,
			deletedTest: (entry.change === "deleted" || entry.removedLinesOnly) && isTestFile,
			noise: noisePath.test(path),
		};
	});
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
	const reasons = Object.fromEntries(
		facts.map((fact): [string, PrRiskReason[]] => [fact.path, prRiskReasons.filter((reason) => fact[reason])]),
	);
	return {
		risk: {
			auth: yesNo(facts.some((fact) => fact.auth)),
			migration: yesNo(facts.some((fact) => fact.migration)),
			dependency: yesNo(facts.some((fact) => fact.dependency)),
			sharedType: yesNo(facts.some((fact) => fact.sharedType)),
			deletedTest: yesNo(facts.some((fact) => fact.deletedTest)),
		},
		groups,
		reasons,
	};
}
