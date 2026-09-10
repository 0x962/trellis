import { describe, expect, test } from "bun:test";
import { lines, runCli } from "../../test/deps.ts";
import { rpcError } from "../../test/fakeServer.ts";
import { linkedPullRequest, prId } from "../../test/fixtures.ts";

const url = "https://github.com/o/r/pull/7";

describe("pr add", () => {
	// CLI-100
	test("pr add links by url", async () => {
		const result = await runCli(["pr", "add", "CDE-42", url], { "pullRequests.link": linkedPullRequest() });
		expect(result.code).toBe(0);
		expect(result.calls[0]).toMatchObject({ path: "pullRequests.link" });
		expect(result.calls[0]!.input).toEqual({ ticket: "CDE-42", url });

		const invalid = await runCli(["pr", "add", "CDE-42", "https://example.com"], {
			"pullRequests.link": rpcError("INVALID_PR_URL"),
		});
		expect(invalid.code).toBe(4);
		expect(invalid.stderr).toEndWith(" (INVALID_PR_URL)\n");

		const ghDown = await runCli(["pr", "add", "CDE-42", url], {
			"pullRequests.link": rpcError("GH_UNAVAILABLE", { reason: "unauthenticated" }),
		});
		expect(ghDown.code).toBe(6);
		expect(ghDown.stderr).toEndWith(" (GH_UNAVAILABLE)\n");
	});

	// CLI-101: the row is stored with `fetchError`, so the verb prints it and
	// still signals the gh outage through the exit code.
	test("pr add with gh down prints the row and exits 6", async () => {
		const row = linkedPullRequest({ fetchError: "gh: not logged in", ciState: "none", fetchedAt: null });
		const result = await runCli(["pr", "add", "CDE-42", url], { "pullRequests.link": row }, { tty: true });
		expect(result.code).toBe(6);
		expect(result.stdout).toContain(url);
		expect(lines(result.stderr)).toHaveLength(1);
		expect(result.stderr).toContain("gh");
		expect(result.stderr).toContain("gh: not logged in");
	});
});

describe("pr list, rm, refresh", () => {
	// CLI-102
	test("pr list, rm, and refresh map their args", async () => {
		const list = await runCli(["pr", "list", "CDE-42"], { "pullRequests.list": [linkedPullRequest()] }, { tty: true });
		expect(list.code).toBe(0);
		expect(list.calls[0]).toMatchObject({ path: "pullRequests.list", input: { ticket: "CDE-42" } });
		const [header, ...rows] = lines(list.stdout);
		const names = header!
			.trim()
			.split(/\s{2,}/)
			.map((name) => name.toLowerCase());
		for (const name of ["number", "state", "cistate", "url"]) expect(names, name).toContain(name);
		expect(rows).toHaveLength(1);
		expect(rows[0]).toContain("7");
		expect(rows[0]).toContain("open");
		expect(rows[0]).toContain("pass");
		expect(rows[0]).toContain(url);

		const rm = await runCli(["pr", "rm", "CDE-42", prId], { "pullRequests.unlink": { deleted: prId } });
		expect(rm.code).toBe(0);
		expect(rm.calls[0]).toMatchObject({ path: "pullRequests.unlink" });
		expect(rm.calls[0]!.input).toEqual({ ticket: "CDE-42", id: prId });

		const refresh = await runCli(["pr", "refresh", prId], { "pullRequests.refresh": linkedPullRequest() });
		expect(refresh.code).toBe(0);
		expect(refresh.calls[0]).toMatchObject({ path: "pullRequests.refresh" });
		expect(refresh.calls[0]!.input).toEqual({ id: prId });
	});
});

describe("pr diff", () => {
	// CLI-103
	test("pr diff prints the raw diff and notes truncation", async () => {
		const diff = "diff --git a/x b/x\n--- a/x\n+++ b/x\n@@ -1 +1 @@\n-old\n+new\n";
		const cut = await runCli(["pr", "diff", prId], { "pullRequests.diff": { diff, truncated: true, url } });
		expect(cut.code).toBe(0);
		expect(cut.calls[0]).toMatchObject({ path: "pullRequests.diff" });
		expect(cut.calls[0]!.input).toEqual({ id: prId });
		expect(cut.stdout).toBe(diff);
		expect(lines(cut.stderr)).toHaveLength(1);
		expect(cut.stderr).toContain(url);

		const whole = await runCli(["pr", "diff", prId], { "pullRequests.diff": { diff, truncated: false, url } });
		expect(whole.stdout).toBe(diff);
		expect(whole.stderr).toBe("");
	});
});
