import { beforeAll, describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readSource } from "../test/css";
import { Button } from "./primitives/Button";
import { Checkbox } from "./primitives/Checkbox";
import { IconButton } from "./primitives/IconButton";
import { Input } from "./primitives/Input";
import { Menu } from "./primitives/Menu";
import { Switch } from "./primitives/Switch";
import { Tabs } from "./primitives/Tabs";
import { Textarea } from "./primitives/Textarea";

// happy-dom computes styles from a plain stylesheet but ignores the rules
// inside a cascade layer. The test puts the body of `@layer base` in a style
// element, so the computed cursor is the one the rule gives.
beforeAll(async () => {
	const css = await readSource("base.css");
	const layer = css.match(/@layer base \{([\s\S]*)\}\s*$/)![1]!;
	const style = document.createElement("style");
	style.textContent = layer;
	document.head.appendChild(style);
});

const cursor = (element: Element) => getComputedStyle(element).cursor;

describe("base.css", () => {
	test("an enabled control shows the pointer and a disabled control shows not-allowed", async () => {
		const user = userEvent.setup();
		render(
			<>
				<Button>Approve</Button>
				<Button disabled>Locked</Button>
				<IconButton label="Refresh" icon={<span />} />
				<Checkbox label="Done" checked={false} onCheckedChange={() => {}} />
				<Switch label="Sound" checked onCheckedChange={() => {}} />
				<Tabs
					items={[
						{ value: "All", label: "All", content: null },
						{ value: "Comments", label: "Comments", content: null },
					]}
					value="All"
					onValueChange={() => {}}
				/>
				<a href="/all">All tickets</a>
				<Menu label="Actions" items={[{ label: "Edit", onSelect: () => {} }]} />
			</>,
		);
		expect(cursor(screen.getByRole("button", { name: "Approve" }))).toBe("pointer");
		expect(cursor(screen.getByRole("button", { name: "Locked" }))).toBe("not-allowed");
		expect(cursor(screen.getByRole("button", { name: "Refresh" }))).toBe("pointer");
		expect(cursor(screen.getByRole("checkbox", { name: "Done" }))).toBe("pointer");
		expect(cursor(screen.getByRole("switch", { name: "Sound" }))).toBe("pointer");
		expect(cursor(screen.getByRole("tab", { name: "Comments" }))).toBe("pointer");
		expect(cursor(screen.getByRole("link", { name: "All tickets" }))).toBe("pointer");
		await user.click(screen.getByRole("button", { name: "Actions" }));
		expect(cursor(await screen.findByRole("menuitem", { name: "Edit" }))).toBe("pointer");
	});

	test("a text field shows the text cursor", () => {
		render(
			<>
				<Input label="Title" value="" onChange={() => {}} />
				<Textarea label="Comment" value="" onChange={() => {}} />
			</>,
		);
		expect(cursor(screen.getByRole("textbox", { name: "Title" }))).toBe("text");
		expect(cursor(screen.getByRole("textbox", { name: "Comment" }))).toBe("text");
	});

	// The description editor, a table row, and a board card are markup the
	// web app draws. The test writes the same attributes the app writes.
	test("an editor shows the text cursor, and a row that opens a ticket and a board card show the pointer", () => {
		const host = document.createElement("div");
		host.innerHTML = [
			'<div id="editor" contenteditable="true"></div>',
			'<div id="linked" role="row" data-href="/t/CDE-1"></div>',
			'<div id="plain" role="row"></div>',
			'<div id="card" data-card=""></div>',
		].join("");
		document.body.appendChild(host);
		const byId = (id: string) => host.querySelector(`#${id}`)!;
		expect(cursor(byId("editor"))).toBe("text");
		expect(cursor(byId("linked"))).toBe("pointer");
		expect(cursor(byId("plain"))).not.toBe("pointer");
		expect(cursor(byId("card"))).toBe("pointer");
		host.remove();
	});
});
