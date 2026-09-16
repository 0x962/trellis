import { afterEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AccountRow } from "../harnessAccounts/queries.ts";
import { usageLogins } from "./accounts.ts";

const dirs: string[] = [];
afterEach(async () => {
	for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true });
});

const account = (overrides: Partial<AccountRow>): AccountRow => ({
	id: "01M00000000000000000000000",
	name: "Work",
	harness: "claude",
	profilePath: "/nowhere",
	isDefault: true,
	enabled: true,
	createdAt: "2026-09-16T00:00:00.000Z",
	updatedAt: "2026-09-16T00:00:00.000Z",
	...overrides,
});

test("the default login of a quota harness joins the list unless an account already names its profile", async () => {
	const home = await mkdtemp(join(tmpdir(), "trellis-usage-logins-"));
	dirs.push(home);
	await mkdir(join(home, ".claude"), { recursive: true });
	await mkdir(join(home, ".codex"), { recursive: true });
	const work = account({ profilePath: join(home, "work-profile") });
	await mkdir(work.profilePath, { recursive: true });
	const named = account({
		id: "01M00000000000000000000001",
		name: "Home",
		harness: "codex",
		profilePath: join(home, ".codex"),
		isDefault: false,
	});
	const logins = await usageLogins([work, named], { HOME: home });
	expect(logins.map((login) => [login.key, login.harness, login.isDefault])).toEqual([
		["account:Work", "claude", true],
		["account:Home", "codex", false],
		// The default Claude login is not an account, so it joins with a
		// default flag of false, because Work is the Claude default.
		["default:claude", "claude", false],
	]);
	expect(logins[2]!.profilePath).toBe(join(home, ".claude"));
});

test("a harness with no account and no profile directory adds no login", async () => {
	const home = await mkdtemp(join(tmpdir(), "trellis-usage-logins-"));
	dirs.push(home);
	await mkdir(join(home, ".claude"), { recursive: true });
	const logins = await usageLogins([], { HOME: home });
	expect(logins.map((login) => [login.key, login.name, login.isDefault])).toEqual([
		["default:claude", "Default login", true],
	]);
});
