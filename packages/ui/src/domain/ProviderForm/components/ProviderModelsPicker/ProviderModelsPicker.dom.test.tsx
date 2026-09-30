import { expect, test } from "bun:test";
import { act, type ReactNode, useState } from "react";
import { createRoot } from "react-dom/client";
import { Command } from "../../../../primitives/Command";
import { SelectedModels } from "./components/SelectedModels";
import { modelGroups } from "./modelGroups";

const domTest = test.skipIf(typeof document === "undefined");
const models = Array.from({ length: 10_000 }, (_, index) => ({ id: `openai/model-${index}`, name: `Model ${index}` }));
const ids = models.map((model) => model.id);

async function mount(content: ReactNode) {
	const container = document.createElement("div");
	document.body.append(container);
	const root = createRoot(container);
	await act(async () => root.render(content));
	return {
		container,
		async close() {
			await act(async () => root.unmount());
			container.remove();
		},
	};
}

async function key(element: Element, value: string) {
	await act(async () => element.dispatchEvent(new KeyboardEvent("keydown", { key: value, bubbles: true })));
}

domTest("10,000 selected models bound chip mounts and preserve distant removal and focus", async () => {
	let result = ids;
	function Selection() {
		const [value, setValue] = useState(ids);
		return (
			<SelectedModels
				value={value}
				onRemove={(id) => {
					result = value.filter((entry) => entry !== id);
					setValue(result);
				}}
			/>
		);
	}
	const fixture = await mount(<Selection />);
	const viewport = fixture.container.querySelector('[aria-label="Selected models"]')!;
	expect(fixture.container.querySelectorAll("button").length).toBeLessThan(25);
	await key(viewport, "End");
	expect(document.activeElement?.getAttribute("aria-label")).toBe("Remove openai/model-9999");
	expect(fixture.container.querySelectorAll("button").length).toBeLessThan(25);
	await act(async () => (document.activeElement as HTMLButtonElement).click());
	expect(result).toEqual(ids.slice(0, -1));
	expect(document.activeElement?.getAttribute("aria-label")).toBe("Remove openai/model-9998");
	await key(viewport, "Home");
	expect(document.activeElement?.getAttribute("aria-label")).toBe("Remove openai/model-0");
	await key(viewport, "PageDown");
	expect(document.activeElement?.getAttribute("aria-label")).toBe("Remove openai/model-6");
	await fixture.close();
});

domTest("disabled selections keep all values and mount no removal actions", async () => {
	const fixture = await mount(
		<SelectedModels
			value={ids}
			disabled
			onRemove={() => {
				throw new Error("Disabled");
			}}
		/>,
	);
	expect(fixture.container.querySelectorAll("button").length).toBe(0);
	expect(fixture.container.querySelectorAll("[data-model-index]").length).toBeLessThan(25);
	await fixture.close();
});

domTest("grouped options bound mounts while keyboard selection reaches every model", async () => {
	const selected: string[] = [];
	const fixture = await mount(
		<Command.Virtual groups={modelGroups(models, ids)} onSelect={(id) => selected.push(id)} />,
	);
	const input = fixture.container.querySelector("input")!;
	expect(fixture.container.querySelectorAll('[role="option"]').length).toBeLessThanOrEqual(13);
	expect(fixture.container.textContent).toContain("OpenAI");
	await key(input, "End");
	expect(fixture.container.querySelector('[data-selected="true"]')?.textContent).toBe("Model 9999");
	expect(fixture.container.querySelector('[data-selected="true"]')?.getAttribute("data-checked")).toBe("true");
	await key(input, "Enter");
	expect(selected).toEqual(["openai/model-9999"]);
	await key(input, "Home");
	await key(input, "ArrowDown");
	await key(input, "Enter");
	expect(selected).toEqual(["openai/model-9999", "openai/model-1"]);
	expect(fixture.container.querySelectorAll('[role="option"]').length).toBeLessThanOrEqual(13);
	await fixture.close();
});

domTest("many groups bound both headings and options", async () => {
	const fixture = await mount(
		<Command.Virtual
			groups={models.map((model) => ({ heading: model.id, items: [{ id: model.id, label: model.name }] }))}
			onSelect={() => {}}
		/>,
	);
	await key(fixture.container.querySelector("input")!, "End");
	expect(fixture.container.querySelectorAll('[role="option"]').length).toBeLessThanOrEqual(13);
	expect(fixture.container.querySelectorAll("[cmdk-group-heading]").length).toBeLessThanOrEqual(13);
	expect(fixture.container.querySelector('[data-selected="true"]')?.textContent).toBe("Model 9999");
	await fixture.close();
});

domTest("flat virtual callers preserve their current item", async () => {
	const selected: string[] = [];
	const fixture = await mount(
		<Command.Virtual
			items={models.map((model, i) => ({ id: model.id, label: model.name, current: i === 9999 }))}
			onSelect={(id) => selected.push(id)}
		/>,
	);
	await key(fixture.container.querySelector("input")!, "Enter");
	expect(selected).toEqual(["openai/model-9999"]);
	await fixture.close();
});

domTest("search keeps typed additions and exact custom values", async () => {
	const selected: string[] = [];
	function Search() {
		const [search, setSearch] = useState("");
		return (
			<Command.Virtual
				groups={modelGroups(models, [])}
				onSearchChange={setSearch}
				items={search ? [{ id: search, label: `Add ${search}`, pinned: true }] : []}
				onSelect={(id) => selected.push(id)}
			/>
		);
	}
	const fixture = await mount(<Search />);
	const input = fixture.container.querySelector("input")!;
	await act(async () => {
		Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "custom/exact-id:release");
		input.dispatchEvent(new Event("input", { bubbles: true }));
	});
	expect(fixture.container.querySelectorAll('[role="option"]').length).toBe(1);
	expect(fixture.container.textContent).toContain("Add custom/exact-id:release");
	await key(input, "Enter");
	expect(selected).toEqual(["custom/exact-id:release"]);
	await fixture.close();
});
