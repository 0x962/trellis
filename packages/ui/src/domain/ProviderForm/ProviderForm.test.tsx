import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ProviderFields } from "./components/ProviderFields";
import type { ProviderFieldsProps } from "./types";

const props: ProviderFieldsProps = {
	value: { name: "Vercel", kind: "vercel-ai-gateway", baseUrl: "", apiKey: "", enabled: true, models: [] },
	onChange() {},
	busy: false,
	valid: false,
	models: (id) => (
		<button type="button" id={id}>
			No models
		</button>
	),
	onClose() {},
	onSubmit() {},
};
const markup = (patch: Partial<ProviderFieldsProps>) => renderToStaticMarkup(<ProviderFields {...props} {...patch} />);

test("Add uses a required empty password and a disabled submit", () => {
	const html = markup({});
	const key = html.match(/<input[^>]*name="apiKey"[^>]*>/)?.[0];
	expect(key).toContain('type="password"');
	expect(key).toContain('autoComplete="off"');
	expect(key).toContain('value=""');
	expect(key).toContain("required");
	expect(html).toContain("Add provider");
	expect(html).toContain("ai-gateway.vercel.sh");
	expect(html).not.toContain('name="baseUrl"');
});
test("Edit shows a readonly kind and a blank optional key", () => {
	const html = markup({ editing: true, keyLast4: "1234" });
	const key = html.match(/<input[^>]*name="apiKey"[^>]*>/)?.[0];
	expect(key).toContain('value=""');
	expect(key).not.toContain("required");
	expect(html).toContain("Leave blank to keep ••••1234");
	expect(html).toContain("Save");
	expect(html).not.toContain('role="combobox"');
});
test("a short stored key has no key hint", () => {
	expect(markup({ editing: true })).toContain("Leave blank to keep the stored key");
});
test("compatible endpoints show the address and server refusal", () => {
	const html = markup({
		value: { ...props.value, kind: "openai-compatible", baseUrl: "https://api.example.com" },
		error: "The provider name already exists.",
		errorField: "name",
	});
	expect(html).toContain('type="url"');
	expect(html).toContain('inputMode="url"');
	expect(html).toContain('role="alert"');
	expect(html).toContain('aria-invalid="true"');
});

test("offers a non-submit provider check with a disabled Save", () => {
	const html = markup({ editing: true, check: { pending: false, canCheck: true, onCheck() {} } });
	const buttons = html.match(/<button\b[\s\S]*?<\/button>/g)!;
	expect(buttons.find((button) => button.includes("Check provider"))).toContain('type="button"');
	expect(html).toContain("Select Check provider before you save.");
	expect(buttons.find((button) => button.includes(">Save<"))).toContain('disabled=""');
});

test("keeps fields editable during a provider check", () => {
	const html = markup({ check: { pending: true, canCheck: true, onCheck() {} } });
	expect(html).toContain("Check in progress. Your values stay in this form.");
	expect(html).toContain('aria-busy="true"');
	expect(html.match(/<input[^>]*name="apiKey"[^>]*>/)?.[0]).not.toContain('disabled=""');
});

test("shows check success and the next form action", () => {
	const html = markup({ check: { pending: false, canCheck: true, result: { ok: true, detail: null }, onCheck() {} } });
	expect(html).toContain('role="status"');
	expect(html).toContain("Provider checked. Select Add provider to save.");
});

test("shows the failed check without the synthetic key in its message", () => {
	const html = markup({
		value: { ...props.value, apiKey: "synthetic-placeholder" },
		check: {
			pending: false,
			canCheck: true,
			result: { ok: false, detail: "The provider refused the key." },
			onCheck() {},
		},
	});
	expect(html).toContain("The provider refused the key");
	expect(html).toContain("Check the key and address, then select Check provider.");
	expect(html).toContain('role="alert"');
	expect(html).toContain('value="synthetic-placeholder"');
	expect(html.match(/<div role="alert"[\s\S]*$/)?.[0]).not.toContain("synthetic-placeholder");
});

test("provider fields preserve long values without browser length limits", () => {
	const name = "Gateway".repeat(1000);
	const baseUrl = `https://example.com/${"path/".repeat(1000)}`;
	const apiKey = "synthetic-key".repeat(1000);
	const html = markup({ value: { ...props.value, kind: "openai-compatible", name, baseUrl, apiKey } });
	expect(html.toLowerCase()).not.toContain("maxlength");
	expect(html).toContain(name);
	expect(html).toContain(baseUrl);
	expect(html.includes(apiKey)).toBe(true);
	expect(html).toContain('type="password"');
});
