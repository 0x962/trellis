import { afterEach, beforeEach, expect, spyOn, test } from "bun:test";
import { act, StrictMode } from "react";
import { createRoot } from "test-renderer";
import { EmptyState } from "./EmptyState";

let root: ReturnType<typeof createRoot>;
let random: ReturnType<typeof spyOn<typeof Math, "random">>;
let previousActEnvironment: boolean | undefined;
const environment = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeEach(() => {
	previousActEnvironment = environment.IS_REACT_ACT_ENVIRONMENT;
	environment.IS_REACT_ACT_ENVIRONMENT = true;
	random = spyOn(Math, "random").mockReturnValue(0);
	root = createRoot();
});

afterEach(async () => {
	await act(async () => root.unmount());
	random.mockRestore();
	environment.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
});

const images = () => root.container.queryAll((node) => node.type === "img");

test("each new page card excludes the previous animal, even with the same random value", async () => {
	await act(async () => root.render(<EmptyState variant="page" title="Page not found" />));
	const first = images()[0]!.props.src;
	await act(async () => root.render(<div />));
	await act(async () => root.render(<EmptyState variant="page" title="Page not found" />));
	expect(images()[0]!.props.src).not.toBe(first);
});

test("an animal stays fixed when the page text changes in StrictMode", async () => {
	await act(async () =>
		root.render(
			<StrictMode>
				<EmptyState variant="page" title="Page not found" />
			</StrictMode>,
		),
	);
	const first = images()[0]!.props;
	random.mockReturnValue(0.99);
	await act(async () =>
		root.render(
			<StrictMode>
				<EmptyState variant="page" title="This page did not load" />
			</StrictMode>,
		),
	);
	expect(images()[0]!.props.src).toBe(first.src);
	expect(first.alt).toBe("");
	expect(first.width).toBe(192);
	expect(first.height).toBe(306);
});

test("explicit images retain their source and accept a new source", async () => {
	await act(async () => root.render(<EmptyState variant="page" image="custom.jpg" />));
	expect(images()[0]!.props.src).toBe("custom.jpg");
	await act(async () => root.render(<EmptyState variant="page" image="changed.jpg" />));
	expect(images()[0]!.props.src).toBe("changed.jpg");
	expect(random).not.toHaveBeenCalled();
});

test("hidden images and compact sections do not select an animal", async () => {
	await act(async () => root.render(<EmptyState variant="page" image={null} />));
	expect(images()).toHaveLength(0);
	await act(async () => root.render(<EmptyState variant="section" />));
	expect(images()).toHaveLength(0);
	expect(random).not.toHaveBeenCalled();
});
