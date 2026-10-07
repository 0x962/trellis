import { afterAll, afterEach, expect, mock, spyOn, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Settings } from "@trellis/api";
import { toast } from "@trellis/ui";
import { act } from "react";
import { createRoot } from "test-renderer";
import { actorStorageKey, readActor, setActorName } from "../../../lib/actor";
import { type AppContext, AppProvider } from "../../../lib/appContext";
import { ActorNameField } from "./ActorNameField";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const entries = new Map<string, string>();
const memoryStorage: Storage = {
	get length() {
		return entries.size;
	},
	clear: () => entries.clear(),
	getItem: (key) => entries.get(key) ?? null,
	key: (index) => [...entries.keys()][index] ?? null,
	removeItem: (key) => entries.delete(key),
	setItem: (key, value) => entries.set(key, value),
};
const hadLocalStorage = "localStorage" in globalThis;
const originalLocalStorage = globalThis.localStorage;
globalThis.localStorage = memoryStorage;

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
	for (const cleanup of cleanups.splice(0)) await cleanup();
	entries.clear();
});
afterAll(() => {
	if (hadLocalStorage) globalThis.localStorage = originalLocalStorage;
	else Reflect.deleteProperty(globalThis, "localStorage");
});

async function mount(write: (settings: Settings) => Promise<Settings>) {
	const queryClient = new QueryClient();
	const settingsKey = ["settings"];
	const actorKey = ["actor"];
	queryClient.setQueryData(settingsKey, { defaultActorName: "Prior name" });
	const app = {
		queryClient,
		client: { settings: { set: write } },
		orpc: {
			settings: {
				get: {
					queryKey: () => settingsKey,
					queryOptions: () => ({ queryKey: settingsKey, queryFn: async () => queryClient.getQueryData(settingsKey) }),
				},
			},
			actors: { default: { queryKey: () => actorKey } },
		},
	} as unknown as AppContext;
	setActorName("Prior name");
	const root = createRoot();
	await act(async () => {
		root.render(
			<QueryClientProvider client={queryClient}>
				<AppProvider value={app}>
					<ActorNameField />
				</AppProvider>
			</QueryClientProvider>,
		);
	});
	const input = () => root.container.queryAll((node) => node.type === "input")[0]!;
	cleanups.push(async () => {
		await act(async () => root.unmount());
		queryClient.clear();
	});
	return {
		input,
		text: () => JSON.stringify(root.container.toJSON(), (key, value) => (key === "ref" ? undefined : value)),
		async save(name: string) {
			await act(async () => {
				const currentTarget = { value: name };
				input().props.onChange({ currentTarget, target: currentTarget });
			});
			await act(async () => {
				await new Promise((resolve) => setTimeout(resolve, 5));
			});
			await act(async () => input().props.onBlur());
			await act(async () => {
				await new Promise((resolve) => setTimeout(resolve, 5));
			});
		},
	};
}

test("the prior actor remains active until the server stores the new name", async () => {
	let store!: (settings: Settings) => void;
	const write = mock(
		(_settings: Settings) =>
			new Promise<Settings>((resolve) => {
				store = resolve;
			}),
	);
	const fixture = await mount(write);
	await fixture.save("New name");

	expect(write).toHaveBeenCalledTimes(1);
	expect(readActor()?.name).toBe("Prior name");
	expect(entries.get(actorStorageKey)).toContain("Prior name");
	expect(fixture.input().props.disabled).toBe(true);

	await act(async () => store({ defaultActorName: "New name" }));

	expect(readActor()?.name).toBe("New name");
	expect(fixture.input().props.disabled).toBe(false);
});

test("a failed write keeps the prior actor and restores the stored value", async () => {
	const failure = spyOn(toast, "error");
	try {
		const fixture = await mount(async () => {
			throw new Error("The host refused the write.");
		});
		await fixture.save("Rejected name");

		expect(readActor()?.name).toBe("Prior name");
		expect(fixture.input().props.value).toBe("Prior name");
		expect(failure).toHaveBeenCalledTimes(1);
	} finally {
		failure.mockRestore();
	}
});

test("a successful retry changes the actor and keeps the field disabled", async () => {
	let attempt = 0;
	let store!: (settings: Settings) => void;
	const failure = spyOn(toast, "error");
	try {
		const fixture = await mount(async (_settings) => {
			attempt += 1;
			if (attempt === 1) throw new Error("The host refused the first write.");
			return new Promise<Settings>((resolve) => {
				store = resolve;
			});
		});
		await fixture.save("Retry name");
		const toastOptions = failure.mock.calls[0]![1] as unknown as {
			action: { onClick: () => void };
		};

		await act(async () => toastOptions.action.onClick());
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 5));
		});

		expect(attempt).toBe(2);
		expect(readActor()?.name).toBe("Prior name");
		expect(fixture.input().props.disabled).toBe(true);

		await act(async () => store({ defaultActorName: "Retry name" }));

		expect(readActor()?.name).toBe("Retry name");
		expect(fixture.input().props.disabled).toBe(false);
	} finally {
		failure.mockRestore();
	}
});

test("an invalid name does not reach the server", async () => {
	const write = mock(async (settings: Settings) => settings);
	const fixture = await mount(write);
	await fixture.save("Invalid:name");

	expect(write).toHaveBeenCalledTimes(0);
	expect(readActor()?.name).toBe("Prior name");
	expect(fixture.text()).toContain("with a nonempty name of printable ASCII characters without a colon");
});
