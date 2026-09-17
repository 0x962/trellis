import { expect, mock, test } from "bun:test";
import { fireEvent, render } from "@testing-library/react";
import { ReviewFiles } from "./ReviewFiles";

test("the changed files use a keyboard tree and keep full paths for selection", () => {
	const select = mock(() => {});
	const { container } = render(
		<ReviewFiles
			files={[
				{ path: "src/features/app.ts", type: "change", additions: 2, deletions: 1 },
				{ path: "test/app.ts", type: "change", additions: 1, deletions: 0 },
			]}
			selected=""
			counts={{ "src/features/app.ts": 2 }}
			onSelect={select}
			search=""
			onSearch={() => {}}
		/>,
	);
	const root = container.querySelector<HTMLElement>('[role="tree"]')!;
	const row = root.querySelector<HTMLElement>('[role="treeitem"][data-item-path="src/features/app.ts"]');
	expect(row).not.toBeNull();
	fireEvent.keyDown(root.querySelector<HTMLElement>('[data-item-path="src"]')!, { key: "ArrowRight" });
	fireEvent.keyDown(row!, { key: "Enter" });
	expect(select).toHaveBeenCalledWith("src/features/app.ts");
	expect(row!.getAttribute("aria-level")).toBe("3");
	expect(row!.textContent).toContain("2");
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

test("the changed-file tree mounts only visible rows", () => {
	const files = Array.from({ length: 200 }, (_, index) => ({
		path: `file-${String(index).padStart(3, "0")}.ts`,
		type: "change",
		additions: 1,
		deletions: 0,
	}));
	const { container } = render(
		<ReviewFiles
			files={files}
			selected="file-150.ts"
			counts={{}}
			onSelect={() => {}}
			search=""
			onSearch={() => {}}
		/>,
	);
	expect(container.querySelectorAll('[role="treeitem"]').length).toBeLessThan(100);
	expect(container.querySelector('[data-item-path="file-150.ts"]')).not.toBeNull();
});

test("a coarse pointer scrolls by 44 px rows instead of 28 px rows", () => {
	const files = Array.from({ length: 200 }, (_, index) => ({
		path: `file-${String(index).padStart(3, "0")}.ts`,
		type: "change",
		additions: 1,
		deletions: 0,
	}));
	const media = window.matchMedia;
	const coarse = (matches: boolean) => {
		window.matchMedia = ((query: string) => ({
			matches: query === "(pointer: coarse)" ? matches : false,
			media: query,
			addEventListener: () => {},
			removeEventListener: () => {},
		})) as unknown as typeof window.matchMedia;
	};
	try {
		coarse(false);
		const fine = render(
			<ReviewFiles
				files={files}
				selected="file-150.ts"
				counts={{}}
				onSelect={() => {}}
				search=""
				onSearch={() => {}}
			/>,
		);
		coarse(true);
		const touch = render(
			<ReviewFiles
				files={files}
				selected="file-150.ts"
				counts={{}}
				onSelect={() => {}}
				search=""
				onSearch={() => {}}
			/>,
		);
		expect(fine.container.querySelector('[role="tree"]')!.scrollTop).toBe(150 * 28);
		expect(touch.container.querySelector('[role="tree"]')!.scrollTop).toBe(150 * 44);
	} finally {
		window.matchMedia = media;
	}
});
