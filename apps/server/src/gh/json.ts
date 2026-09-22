import type { GhFailure } from "./run.ts";

const commandText = (args: string[]) =>
	["gh", ...args].map((arg) => (/\s/.test(arg) ? JSON.stringify(arg) : arg)).join(" ");

const firstLineOf = (stdout: string) => {
	const line = stdout.split(/\r?\n/, 1)[0]!.trim();
	return line === "" ? "(empty output)" : line;
};

export const ghJsonFailure = (args: string[], stdout: string, code: number | null): GhFailure => ({
	ok: false,
	reason: "error",
	message: `gh answered with something that is not JSON. Command: ${commandText(args)}. Exit code: ${code ?? "unknown"}. First line: ${firstLineOf(stdout)}.`,
	code,
	stdout,
});

export class GhJsonError extends Error {
	constructor(readonly failure: GhFailure) {
		super(failure.message);
		this.name = "GhJsonError";
	}
}

export const parseGhJson = <T>(args: string[], stdout: string, code: number | null): T => {
	try {
		return JSON.parse(stdout) as T;
	} catch {
		throw new GhJsonError(ghJsonFailure(args, stdout, code));
	}
};

export const parseGhJsonResult = <T>(
	args: string[],
	stdout: string,
	code: number | null,
): { ok: true; value: T } | { ok: false; failure: GhFailure } => {
	try {
		return { ok: true, value: parseGhJson<T>(args, stdout, code) };
	} catch (error) {
		if (error instanceof GhJsonError) return { ok: false, failure: error.failure };
		throw error;
	}
};
