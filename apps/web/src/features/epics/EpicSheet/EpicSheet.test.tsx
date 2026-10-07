import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { epicFormValidationProps } from "./EpicSheet";

describe("epic form validation", () => {
	test("lets the schema handle an empty name and keeps the accessible required state", () => {
		const html = renderToStaticMarkup(
			<form {...epicFormValidationProps}>
				<input name="name" required />
			</form>,
		);

		expect(html).toContain('<form noValidate=""');
		expect(html).toContain('required=""');
	});
});
