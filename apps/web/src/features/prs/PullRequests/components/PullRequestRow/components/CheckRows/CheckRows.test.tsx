import { describe, expect, test } from "bun:test";
import { render, within } from "@testing-library/react";
import { checkList } from "../../../../../../../../test/prs";
import { CheckRows } from "./CheckRows";

const seeded = checkList(
	["lint", "pass"],
	["typecheck (desktop)", "fail"],
	["test (host-service)", "pass"],
	["build (macos-arm64)", "pending"],
);

const rows = () => [...document.querySelectorAll<HTMLElement>("[data-check-row]")];

const namesOf = () => rows().map((row) => row.querySelector("[data-check-name]")!.textContent);

const textOf = (row: HTMLElement) => (row.textContent ?? "").replace(/\s+/g, " ").trim();

describe("CheckRows", () => {
	// PR-19. The failing check is what the reader looks for first.
	test("puts the failing check first and keeps the server order after it", () => {
		render(<CheckRows checks={seeded} />);
		expect(namesOf()).toEqual(["typecheck (desktop)", "lint", "test (host-service)", "build (macos-arm64)"]);
	});

	// PR-20. A canceled check never finished, so it reads as a failure.
	test("sorts a canceled check with the failing checks", () => {
		render(
			<CheckRows
				checks={checkList(["lint", "pass"], ["e2e", "cancel"], ["build", "pending"], ["typecheck", "fail"])}
			/>,
		);
		expect(namesOf()).toEqual(["e2e", "typecheck", "lint", "build"]);
	});

	// PR-21
	test("shows the check name and the workflow name on every row", () => {
		render(<CheckRows checks={seeded} />);
		expect(rows()).toHaveLength(seeded.length);
		for (const row of rows()) {
			expect(row.querySelector("[data-check-workflow]")!.textContent).toBe("ci");
		}
		expect(namesOf().sort()).toEqual(seeded.map((check) => check.name).sort());
	});

	// PR-22
	test("links each check to its details URL in a new tab", () => {
		render(<CheckRows checks={seeded} />);
		expect(rows()).toHaveLength(seeded.length);
		for (const row of rows()) {
			const link = within(row).getByRole("link", { name: "Open" });
			expect(link.getAttribute("href")).toBe("https://github.com/acme/web/actions/runs/118");
			expect(link.getAttribute("target")).toBe("_blank");
			expect(link.getAttribute("rel")).toContain("noopener");
		}
	});

	// PR-23. gh reports no details URL for a check that never started.
	test("drops the Open link for a check without a details URL", () => {
		render(<CheckRows checks={[{ name: "lint", workflow: "ci", bucket: "pending", link: null }]} />);
		const row = rows()[0]!;
		expect(row.querySelector("[data-check-name]")!.textContent).toBe("lint");
		expect(row.querySelector("[data-check-bucket]")!.textContent).toBe("Pending");
		expect(within(row).queryByRole("link", { name: "Open" })).toBeNull();
	});

	// PR-24. CheckSchema carries name, workflow, bucket, and link only.
	test("shows no duration, because the contract carries no check timing", () => {
		render(<CheckRows checks={seeded} />);
		expect(rows()).toHaveLength(seeded.length);
		const labels: Record<string, string> = { pass: "Passed", fail: "Failed", pending: "Pending" };
		for (const row of rows()) {
			const name = row.querySelector("[data-check-name]")!.textContent!;
			const check = seeded.find((entry) => entry.name === name)!;
			expect(textOf(row)).toBe(`${labels[check.bucket]} ${name} ci Open`);
		}
	});

	// PR-25
	test("keeps every check row at a fixed height of 32 px", () => {
		render(<CheckRows checks={seeded} />);
		expect(rows()).toHaveLength(seeded.length);
		for (const row of rows()) {
			expect(row.getAttribute("class")).toContain("h-8");
		}
	});
});
