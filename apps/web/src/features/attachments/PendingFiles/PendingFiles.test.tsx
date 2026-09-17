import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { PendingFiles } from "./PendingFiles";

// PendingFiles holds no state, so a test needs a parent that owns the list.
// CreateTicketDialog owns it the same way.
function Harness({ initial = [] as File[] }) {
	const [files, setFiles] = useState<File[]>(initial);
	return (
		<PendingFiles
			files={files}
			onAdd={(next) => setFiles((current) => [...current, ...next])}
			onRemove={(index) => setFiles((current) => current.filter((_, at) => at !== index))}
		/>
	);
}

const file = (name: string, size = 2048) => new File([new Uint8Array(size)], name, { type: "text/plain" });

describe("features/attachments/PendingFiles", () => {
	// TRL-23. A file picked in the create modal waits in the browser: its
	// name and size show, and it uploads only after the create answers.
	test("a picked file lists its name and size", async () => {
		const user = userEvent.setup();
		const { container } = render(<Harness />);
		await user.upload(container.querySelector('input[type="file"]') as HTMLInputElement, file("notes.txt"));
		expect(screen.getByText("notes.txt")).toBeDefined();
		expect(screen.getByText("2.0 KB")).toBeDefined();
	});

	test("remove takes one file off the list and keeps the rest", async () => {
		const user = userEvent.setup();
		render(<Harness initial={[file("a.txt"), file("b.txt")]} />);
		await user.click(screen.getByRole("button", { name: "Remove a.txt" }));
		expect(screen.queryByText("a.txt")).toBeNull();
		expect(screen.getByText("b.txt")).toBeDefined();
	});

	test("no files shows only the picker", () => {
		render(<Harness />);
		expect(screen.getByRole("button", { name: "Add" })).toBeDefined();
		expect(screen.queryByRole("button", { name: /Remove / })).toBeNull();
	});
});
