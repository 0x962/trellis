import { expect, test } from "bun:test";
import { hostReadinessText } from "./hostReadinessText.ts";

test("renders satisfied and missing host prerequisites", () => {
	const text = hostReadinessText({
		ready: false,
		satisfied: [
			{
				kind: "executable",
				name: "Git",
				detail: "The executable is available on the selected host.",
				hostPath: "/usr/bin/git",
				instruction: null,
			},
		],
		missing: [
			{
				kind: "provider-credential",
				name: "Codex: Fictional account",
				detail: "The selected host does not have the account credential.",
				hostPath: "/home/agent/.codex",
				instruction: "Run CODEX_HOME='/home/agent/.codex' codex login on the selected host.",
			},
		],
	});
	expect(text).toBe(`HOST READINESS
Status: not ready

SATISFIED
[executable] Git
  The executable is available on the selected host.
  Host path: /usr/bin/git

MISSING
[provider-credential] Codex: Fictional account
  The selected host does not have the account credential.
  Host path: /home/agent/.codex
  Action: Run CODEX_HOME='/home/agent/.codex' codex login on the selected host.
`);
});

test("does not render fields outside the report view", () => {
	const report = {
		ready: true,
		satisfied: [],
		missing: [],
		credentialValue: "secret-token",
		clientPath: "/Users/client/projects/fictional",
	};
	const text = hostReadinessText(report);
	expect(text).not.toContain("secret-token");
	expect(text).not.toContain("/Users/client");
});
