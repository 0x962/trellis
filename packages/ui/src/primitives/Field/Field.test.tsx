import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Input } from "../Input";
import { Select } from "../Select";
import { Textarea } from "../Textarea";
import { Field } from "./Field";

test("the label and hint identify the same control and preserve an external description", () => {
	const html = renderToStaticMarkup(
		<Field label="Name" hint="Names the project.">
			<input id="name" aria-describedby="external" />
		</Field>,
	);
	expect(html).toContain('for="name"');
	expect(html).toContain('aria-labelledby="name-label"');
	expect(html).toContain('aria-describedby="external name-hint"');
	expect(html).toContain('id="name-hint"');
});

test("an error replaces the hint and reaches the input", () => {
	const html = renderToStaticMarkup(
		<Input label="Key" hint="A ticket prefix." error="Use uppercase letters." defaultValue="op" />,
	);
	expect(html).toContain('aria-invalid="true"');
	expect(html).toContain('role="alert"');
	expect(html).toContain("Use uppercase letters.");
	expect(html).not.toContain("A ticket prefix.");
	expect(html.match(/<p /g)).toHaveLength(1);
});

test("a read-only reason occupies the hint slot and the textarea remains selectable", () => {
	const html = renderToStaticMarkup(
		<Textarea label="Key" readOnly readOnlyReason="Every ticket ID starts with OP." hint="Unused hint." value="OP" />,
	);
	expect(html).toContain('readOnly=""');
	expect(html).not.toContain('disabled=""');
	expect(html).toContain("Every ticket ID starts with OP.");
	expect(html).not.toContain("Unused hint.");
});

test("a composed select retains one field label and its description", () => {
	const html = renderToStaticMarkup(
		<Field label="Priority" hint="Sets the order." disabled>
			<Select label="Priority" items={[{ value: "high", label: "High" }]} value="high" onValueChange={() => {}} />
		</Field>,
	);
	expect(html.match(/<label /g)).toHaveLength(1);
	expect(html).toContain("aria-describedby=");
	expect(html).toContain('disabled=""');
	expect(html).toContain("Sets the order.");
});

test("a trailing action follows the input and precedes its hint", () => {
	const html = renderToStaticMarkup(
		<Input
			label="Local path"
			hint="The agent works here."
			trailingAction={<button type="button">Choose folder</button>}
		/>,
	);
	expect(html.indexOf("<input")).toBeLessThan(html.indexOf("<button"));
	expect(html.indexOf("<button")).toBeLessThan(html.indexOf("<p "));
});
