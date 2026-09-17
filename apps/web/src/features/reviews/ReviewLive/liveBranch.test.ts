import { describe, expect, test } from "bun:test";
import { liveBranchState, parseLiveBranchReport } from "./liveBranch";

const report = `<!-- lite-env-dev-pod -->
## 🟢 Live Branch Dev Pod Ready

| | |
|---|---|
| **Environment** | \`n56100\` |
| **URL** | [https://live-n56100.example.com](https://live-n56100.example.com) |
| **Admin** | [https://live-n56100.example.com/admin/](https://live-n56100.example.com/admin/) |
| **Gateway URL** | [https://live-gw-n56100.example.com](https://live-gw-n56100.example.com) |
| **Pod** | \`lite-env-n56100\` |
| **Branch** | \`feature/live-branch\` |

Updated <relative-time datetime="2026-09-17T16:44:34.169Z"></relative-time>`;

describe("parseLiveBranchReport", () => {
	test("extracts the workflow report without its presentation markup", () => {
		expect(parseLiveBranchReport(report)).toEqual({
			ready: true,
			environment: "n56100",
			url: "https://live-n56100.example.com",
			adminUrl: "https://live-n56100.example.com/admin/",
			gatewayUrl: "https://live-gw-n56100.example.com",
			pod: "lite-env-n56100",
			branch: "feature/live-branch",
			updatedAt: "2026-09-17T16:44:34.169Z",
		});
	});

	test("ignores other comments", () => {
		expect(parseLiveBranchReport("Deploy this branch.")).toBeNull();
	});
});

describe("liveBranchState", () => {
	test("reports ready when automatic deploy is enabled and the deployment is current", () => {
		expect(
			liveBranchState({
				labels: [{ name: "Live Branch: Enabled" }],
				comments: [{ body: report }],
				commits: [{ committedDate: "2026-09-17T16:40:00.000Z" }],
			}).label,
		).toBe("Ready");
	});

	test("reports an available branch when automatic deploy is off", () => {
		expect(
			liveBranchState({
				comments: [{ body: report }],
				commits: [{ committedDate: "2026-09-17T16:40:00.000Z" }],
			}).label,
		).toBe("Available");
	});

	test("reports an update when the latest commit is newer than the deployment", () => {
		expect(
			liveBranchState({
				labels: [{ name: "Live Branch: Enabled" }],
				comments: [{ body: report }],
				commits: [{ committedDate: "2026-09-17T17:00:00.000Z" }],
			}).label,
		).toBe("Update available");
	});

	test("reports enabled before the first deployment", () => {
		expect(liveBranchState({ labels: [{ name: "Live Branch: Enabled" }] }).label).toBe("Enabled");
	});

	test("reports no deployment when the workflow has not started", () => {
		expect(liveBranchState({}).label).toBe("Not deployed");
	});
});
