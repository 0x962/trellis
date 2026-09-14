import { expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { WorkspaceChanges } from "./WorkspaceChanges";

function Fixture() {
	const [selected, setSelected] = useState("result.txt");
	return (
		<WorkspaceChanges
			files={[{ path: "result.txt", status: "??" }]}
			diff="+updated tracked line"
			truncated={false}
			selected={selected}
			onSelect={setSelected}
			content={
				selected ? { path: selected, text: "file contents", bytes: 13, binary: false, truncated: false } : undefined
			}
			pending={false}
		/>
	);
}

test("a file reader can return to the workspace diff without leaving the tab", async () => {
	const user = userEvent.setup();
	render(<Fixture />);
	await user.click(screen.getByRole("combobox", { name: "Workspace file" }));
	await user.click(screen.getByRole("option", { name: "Workspace diff" }));
	expect(screen.getByText("+updated tracked line")).toBeDefined();
	expect(screen.queryByText("file contents")).toBeNull();
});
