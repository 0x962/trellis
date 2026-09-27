import { expect, test } from "bun:test";
import { createHostReadinessReport, type HostReadinessInput } from "./hostReadiness.ts";

const cleanLinuxHome: HostReadinessInput = {
	executables: [
		{
			id: "git",
			name: "Git",
			hostPath: null,
			installInstruction: "Install Git on the selected host.",
		},
		{
			id: "codex",
			name: "Codex",
			hostPath: null,
			installInstruction: "Install Codex on the selected host.",
		},
	],
	projects: [
		{
			id: "project-fictional",
			key: "DEMO",
			name: "Fictional project",
			hostPath: "/home/agent/projects/fictional",
			directoryPresent: false,
		},
	],
	repositories: [
		{
			id: "repository-fictional",
			projectId: "project-fictional",
			name: "example/fictional",
			hostPath: "/home/agent/projects/fictional",
			present: false,
		},
	],
	workRoots: [
		{
			id: "agents",
			name: "Agent work root",
			hostPath: "/home/agent/.trellis/agents",
			present: false,
			writable: false,
		},
	],
	providers: [
		{
			id: "provider-codex",
			name: "Codex",
			executableId: "codex",
			account: {
				id: "account-fictional",
				name: "Fictional account",
				hostProfilePath: "/home/agent/.codex",
				credentialPresent: false,
			},
			loginInstruction: "Run CODEX_HOME='/home/agent/.codex' codex login on the selected host.",
		},
	],
};

test("lists every missing prerequisite in a clean Linux home", () => {
	const report = createHostReadinessReport(cleanLinuxHome);
	expect(report.ready).toBeFalse();
	expect(report.satisfied).toEqual([]);
	expect(report.missing.map((item) => item.id)).toEqual([
		"executable:git",
		"executable:codex",
		"project:project-fictional",
		"repository:repository-fictional",
		"work-root:agents",
		"provider-credential:provider-codex",
	]);
	expect(report.missing.find((item) => item.kind === "provider-credential")).toMatchObject({
		hostPath: "/home/agent/.codex",
		instruction: "Run CODEX_HOME='/home/agent/.codex' codex login on the selected host.",
	});
});

test("permits a fictional repository launch after host setup", () => {
	const readyInput: HostReadinessInput = {
		...cleanLinuxHome,
		executables: cleanLinuxHome.executables.map((item) => ({
			...item,
			hostPath: `/usr/local/bin/${item.id}`,
		})),
		projects: cleanLinuxHome.projects.map((item) => ({ ...item, directoryPresent: true })),
		repositories: cleanLinuxHome.repositories.map((item) => ({ ...item, present: true })),
		workRoots: cleanLinuxHome.workRoots.map((item) => ({ ...item, present: true, writable: true })),
		providers: cleanLinuxHome.providers.map((item) => ({
			...item,
			account: item.account === null ? null : { ...item.account, credentialPresent: true },
		})),
	};
	const report = createHostReadinessReport(readyInput);
	const launches: string[] = [];
	if (report.ready) launches.push(readyInput.repositories[0]!.hostPath);
	expect(report.missing).toEqual([]);
	expect(report.satisfied).toHaveLength(6);
	expect(launches).toEqual(["/home/agent/projects/fictional"]);
});

test("returns no secret values or client paths from extra input fields", () => {
	const input = {
		...cleanLinuxHome,
		clientPath: "/Users/client/projects/fictional",
		credentialValue: "secret-token",
	};
	const text = JSON.stringify(createHostReadinessReport(input));
	expect(text).not.toContain("/Users/client");
	expect(text).not.toContain("secret-token");
});
