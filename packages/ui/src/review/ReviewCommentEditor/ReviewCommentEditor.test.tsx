import { expect, mock, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { ReviewCommentEditor } from "./ReviewCommentEditor";

test("previews a draft without losing text and saves it from the inline form", async () => {
	const save = mock(() => {});
	function Editor() {
		const [body, setBody] = useState("");
		return (
			<ReviewCommentEditor
				body={body}
				onChange={setBody}
				onSave={save}
				onCancel={() => {}}
				renderPreview={(text) => <p>{text}</p>}
			/>
		);
	}
	render(<Editor />);
	expect(screen.queryByRole("dialog")).toBeNull();
	expect(screen.getByRole("button", { name: "Add to review" }).hasAttribute("disabled")).toBe(true);
	await userEvent.type(screen.getByRole("textbox", { name: "Comment" }), "Keep this local");
	await userEvent.click(screen.getByRole("tab", { name: "Preview" }));
	expect(screen.getByRole("tabpanel").textContent).toContain("Keep this local");
	await userEvent.click(screen.getByRole("tab", { name: "Write" }));
	expect((screen.getByRole("textbox", { name: "Comment" }) as HTMLTextAreaElement).value).toBe("Keep this local");
	await userEvent.click(screen.getByRole("button", { name: "Add to review" }));
	expect(save).toHaveBeenCalledTimes(1);
	expect(screen.getByText("Reviews stay local in Trellis.")).toBeDefined();
});

test("cancels the inline form without saving", async () => {
	const cancel = mock(() => {});
	const save = mock(() => {});
	render(
		<ReviewCommentEditor
			body="Draft"
			onChange={() => {}}
			onSave={save}
			onCancel={cancel}
			renderPreview={(body) => body}
		/>,
	);
	await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
	expect(cancel).toHaveBeenCalledTimes(1);
	expect(save).not.toHaveBeenCalled();
});
