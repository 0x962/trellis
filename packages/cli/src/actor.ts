import { usageError } from "./errors.ts";

export type ActorKind = "human" | "agent";

export type ActorStep = { step: string; applied: boolean; value: string | null };

// `actor` is the `x-trellis-actor` value `kind:name`. `source` names the
// step of the chain that gave the name. `steps` is the whole chain in order,
// for `whoami`.
export type ActorResolution = {
	actor: string;
	kind: ActorKind;
	name: string;
	source: string;
	session: string | null;
	steps: ActorStep[];
};

export type ActorInput = {
	as?: string | undefined;
	env: Record<string, string | undefined>;
	gitUserName: () => string;
	osUser: () => string;
};

export const stepNames = [
	"--as",
	"TRELLIS_ACTOR",
	"CLAUDECODE",
	"CLAUDE_CODE_SESSION_ID",
	"CLAUDE_SESSION_ID",
	"CODEX_*",
	"MUSE_*",
	"git config user.name",
	"OS user",
] as const;

// The name grammar of `x-trellis-actor`: printable ASCII without the colon,
// 1 to 64 characters. It equals `actorHeaderPattern` in
// packages/api/src/refs.ts; actor.test.ts parses every result with the api
// schema, so the two cannot drift.
const namePattern = /^[\x20-\x39\x3B-\x7E]{1,64}$/;

export const actorGrammar =
	"Expected <human|agent>:<name>, the name 1 to 64 printable ASCII characters without a colon.";

// NFKD splits a letter from its accent, so dropping the combining marks
// leaves the base letter. Every other character outside the grammar is
// dropped too, and the rest is cut to the 64-character limit.
export const cleanName = (raw: string): string =>
	raw
		.normalize("NFKD")
		.replace(/\p{M}/gu, "")
		.replace(/[^\x20-\x39\x3B-\x7E]/g, "")
		.trim()
		.slice(0, 64);

type Explicit = { kind?: ActorKind; name?: string };

// `kind:name` sets both. A bare `human` or `agent` sets the kind only. Any
// other bare word is a name and keeps the inferred kind.
const parseExplicit = (value: string, source: string): Explicit => {
	const colon = value.indexOf(":");
	if (colon === -1) {
		if (value === "human" || value === "agent") return { kind: value };
		if (!namePattern.test(value)) throw usageError(`invalid ${source} "${value}": ${actorGrammar}`);
		return { name: value };
	}
	const kind = value.slice(0, colon);
	const name = value.slice(colon + 1);
	if ((kind !== "human" && kind !== "agent") || !namePattern.test(name)) {
		throw usageError(`invalid ${source} "${value}": ${actorGrammar}`);
	}
	return { kind, name };
};

const present = (value: string | undefined): string | undefined =>
	value === undefined || value === "" ? undefined : value;

export const resolveActor = (input: ActorInput): ActorResolution => {
	const env = input.env;
	const claudeCode = present(env.CLAUDECODE);
	// Claude Code exports CLAUDE_CODE_SESSION_ID. CLAUDE_SESSION_ID is the
	// name a hand-set environment uses. The first one set is the session.
	const codeSession = present(env.CLAUDE_CODE_SESSION_ID);
	const plainSession = present(env.CLAUDE_SESSION_ID);
	const session = codeSession ?? plainSession;
	const trellisActor = present(env.TRELLIS_ACTOR);
	const codexKey = Object.keys(env).find((key) => key.startsWith("CODEX_") && present(env[key]) !== undefined);
	// Muse exports MUSE_CURRENT_SESSION_LOG and MUSE_TOOL_USE_ID to the shell
	// of a tool call. A person sets the launcher variables of Muse, such as
	// MUSE_NO_AUTO_UPDATE, so those mark nothing.
	const museKey = Object.keys(env).find(
		(key) => (key === "MUSE_CURRENT_SESSION_LOG" || key === "MUSE_TOOL_USE_ID") && present(env[key]) !== undefined,
	);
	const inferredKind: ActorKind =
		claudeCode !== undefined || session !== undefined || codexKey !== undefined || museKey !== undefined
			? "agent"
			: "human";
	const agentName =
		claudeCode !== undefined || session !== undefined
			? "claude-code"
			: codexKey !== undefined
				? "codex"
				: museKey !== undefined
					? "muse"
					: "agent";

	const values: Record<string, string | null> = {
		"--as": input.as ?? null,
		TRELLIS_ACTOR: trellisActor ?? null,
		CLAUDECODE: claudeCode ?? null,
		CLAUDE_CODE_SESSION_ID: codeSession ?? null,
		CLAUDE_SESSION_ID: plainSession ?? null,
		"CODEX_*": codexKey ?? null,
		"MUSE_*": museKey ?? null,
		"git config user.name": null,
		"OS user": null,
	};

	let source: string | undefined;
	let kind: ActorKind | undefined;
	let name: string | undefined;
	const take = (step: string, hit: Explicit) => {
		source = step;
		kind = hit.kind;
		name = hit.name;
	};
	if (input.as !== undefined) take("--as", parseExplicit(input.as, "--as"));
	else if (trellisActor !== undefined) take("TRELLIS_ACTOR", parseExplicit(trellisActor, "TRELLIS_ACTOR"));
	else if (claudeCode !== undefined) take("CLAUDECODE", { kind: "agent", name: "claude-code" });
	else if (codeSession !== undefined) take("CLAUDE_CODE_SESSION_ID", { kind: "agent", name: "claude-code" });
	else if (plainSession !== undefined) take("CLAUDE_SESSION_ID", { kind: "agent", name: "claude-code" });
	else if (codexKey !== undefined) take("CODEX_*", { kind: "agent", name: "codex" });
	else if (museKey !== undefined) take("MUSE_*", { kind: "agent", name: "muse" });

	kind ??= inferredKind;
	if (name === undefined && kind === "agent") name = agentName;
	if (name === undefined) {
		const git = cleanName(input.gitUserName());
		values["git config user.name"] = git;
		if (git !== "") {
			name = git;
			source ??= "git config user.name";
		} else {
			name = cleanName(input.osUser());
			values["OS user"] = name;
			source ??= "OS user";
		}
	}

	const steps = stepNames.map((step) => ({ step, applied: step === source, value: values[step] ?? null }));
	return { actor: `${kind}:${name}`, kind, name, source: sourceLabel(source!), session: session ?? null, steps };
};

// The short labels the tests and the hint use for the two lookups.
const sourceLabel = (step: string) => (step === "git config user.name" ? "git" : step === "OS user" ? "os" : step);

export const actorHint = (resolution: ActorResolution) =>
	`hint: the actor name ${resolution.name} comes from git config user.name; set TRELLIS_ACTOR=${resolution.actor} to choose it\n`;
