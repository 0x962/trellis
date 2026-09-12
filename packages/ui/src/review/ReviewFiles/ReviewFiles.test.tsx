import { expect, mock, test } from "bun:test";
import { render, waitFor } from "@testing-library/react";
import { ReviewFiles } from "./ReviewFiles";

test("the changed files use a keyboard tree and keep full paths for selection", async () => {
	const select = mock(() => {});
	const { container } = render(
		<ReviewFiles
			files={[
				{ path: "src/app.ts", type: "change", additions: 2, deletions: 1 },
				{ path: "test/app.ts", type: "change", additions: 1, deletions: 0 },
			]}
			selected=""
			counts={{ "src/app.ts": 2 }}
			onSelect={select}
			search=""
			onSearch={() => {}}
		/>,
	);
	await waitFor(() => expect(container.querySelector("file-tree-container")).not.toBeNull());
	const root = container.querySelector("file-tree-container")!.shadowRoot!;
	await waitFor(() => expect(root.querySelector('[role="tree"]')).not.toBeNull());
	const row = root.querySelector<HTMLElement>('[data-item-path="src/app.ts"]');
	expect(row).not.toBeNull();
	row!.click();
	expect(select).toHaveBeenCalledWith("src/app.ts");
});

test("an empty file search has no folder rows and shows its message next to the search", () => {
	const { container } = render(
		<ReviewFiles
			files={[{ path: "src/app.ts", type: "change", additions: 1, deletions: 0 }]}
			selected=""
			counts={{}}
			onSelect={() => {}}
			search="missing"
			onSearch={() => {}}
		/>,
	);
	expect(container.querySelector(".review-tree-mount")?.hasAttribute("hidden")).toBe(true);
	expect(container.querySelector(".review-file-search")?.textContent).toContain("No files match.");
});
