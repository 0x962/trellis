import { afterEach, beforeEach, expect, spyOn, test } from "bun:test";
import { act, StrictMode } from "react";
import { createRoot } from "test-renderer";
import { EmptyState } from "./EmptyState";

let root: ReturnType<typeof createRoot>;
let random: ReturnType<typeof spyOn<typeof Math, "random">>;
let request: ReturnType<typeof spyOn<typeof globalThis, "fetch">>;
let previousActEnvironment: boolean | undefined;
const environment = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeEach(() => {
	previousActEnvironment = environment.IS_REACT_ACT_ENVIRONMENT;
	environment.IS_REACT_ACT_ENVIRONMENT = true;
	random = spyOn(Math, "random").mockReturnValue(0);
	request = spyOn(globalThis, "fetch")
		.mockResolvedValueOnce(Response.json({ message: "https://example.com/dog-1.jpg" }))
		.mockResolvedValue(Response.json({ message: "https://example.com/dog-2.jpg" }));
	root = createRoot();
});

afterEach(async () => {
	await act(async () => root.unmount());
	random.mockRestore();
	request.mockRestore();
	environment.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
});

const images = () => root.container.queryAll((node) => node.type === "img");

test("each new page card requests a fresh animal", async () => {
	await act(async () => root.render(<EmptyState variant="page" title="Page not found" />));
	const first = images()[0]!.props.src;
	await act(async () => root.render(<div />));
	await act(async () => root.render(<EmptyState variant="page" title="Page not found" />));
	expect(images()[0]!.props.src).not.toBe(first);
	expect(request).toHaveBeenCalledTimes(2);
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
	const calls = request.mock.calls.length;
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
	expect(first.referrerPolicy).toBe("no-referrer");
	expect(request).toHaveBeenCalledTimes(calls);
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

for (const [choice, endpoint, field] of [
	[0, "https://dog.ceo/api/breeds/image/random", "message"],
	[0.5, "https://cataas.com/cat?json=true", "url"],
	[0.99, "https://randomfox.ca/floof/", "image"],
] as const) {
	test(`loads the photo from ${endpoint} without a referrer`, async () => {
		random.mockReturnValue(choice);
		request.mockReset().mockResolvedValue(Response.json({ [field]: "https://example.com/animal.jpg" }));
		await act(async () => root.render(<EmptyState variant="page" />));
		expect(images()[0]!.props.src).toBe("https://example.com/animal.jpg");
		expect(request.mock.calls[0]![0]).toBe(endpoint);
		expect(request.mock.calls[0]![1]).toMatchObject({ cache: "no-store", referrerPolicy: "no-referrer" });
	});
}

test("an unavailable photo service omits the picture without retries", async () => {
	request.mockReset().mockRejectedValue(new TypeError("Failed to fetch"));
	await act(async () => root.render(<EmptyState variant="page" />));
	expect(images()).toHaveLength(0);
	expect(request).toHaveBeenCalledTimes(1);
});

test("a failed external image hides the picture without retries", async () => {
	await act(async () => root.render(<EmptyState variant="page" />));
	await act(async () => images()[0]!.props.onError());
	expect(images()).toHaveLength(0);
	expect(request).toHaveBeenCalledTimes(1);
});

test("unmount aborts the external request", async () => {
	await act(async () => root.render(<EmptyState variant="page" />));
	const signal = request.mock.calls[0]![1]!.signal!;
	expect(signal.aborted).toBe(false);
	await act(async () => root.render(<div />));
	expect(signal.aborted).toBe(true);
});
