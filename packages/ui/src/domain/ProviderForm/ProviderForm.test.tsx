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
