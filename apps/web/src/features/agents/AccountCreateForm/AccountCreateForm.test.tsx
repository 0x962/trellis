import { afterAll, afterEach, expect, mock, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { AccountHarness, HarnessAccount, HarnessAccountCreate } from "@trellis/api";
import { act } from "react";
import { createRoot } from "test-renderer";
import { type AppContext, AppProvider } from "../../../lib/appContext";

type FormProps = {
	initialName: string;
	initialHarness: string;
	lockHarness: boolean;
	busy: boolean;
	error?: string;
	onClose: () => void;
	onSubmit: (input: HarnessAccountCreate) => void;
};
let form: FormProps;
mock.module("@trellis/ui", () => ({
	HarnessAccountForm: (props: FormProps) => {
		form = props;
		return null;
	},
}));
const { AccountCreateForm } = await import("./AccountCreateForm");
afterAll(() => mock.restore());
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
	for (const cleanup of cleanups.splice(0)) await cleanup();
});

async function fixture(create: (input: HarnessAccountCreate) => Promise<HarnessAccount>) {
	const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
	const keys = ["accounts", "usage-accounts", "usage-report"];
	for (const key of keys) queryClient.setQueryData([key], []);
	const picked: HarnessAccount[] = [];
	const app = {
		client: { harnessAccounts: { create } },
		orpc: {
			harnessAccounts: { list: { key: () => ["accounts"] } },
			usage: { accounts: { key: () => ["usage-accounts"] }, report: { key: () => ["usage-report"] } },
		},
		queryClient,
	} as unknown as AppContext;
	const root = createRoot();
	const render = async (scope = "parent", harness: AccountHarness = "codex") =>
		act(async () =>
			root.render(
				<QueryClientProvider client={queryClient}>
					<AppProvider value={app}>
						<AccountCreateForm
							name="New work"
							harness={harness}
							scope={scope}
							onClose={() => {}}
							onCreated={(account) => picked.push(account)}
						/>
					</AppProvider>
				</QueryClientProvider>,
			),
		);
	await render();
	cleanups.push(async () => {
		await act(async () => root.unmount());
		queryClient.clear();
	});
	return {
		picked,
		queryClient,
		render,
		close: async () => act(async () => form.onClose()),
		unmount: async () => act(async () => root.unmount()),
		invalidated: () => keys.map((key) => queryClient.getQueryState([key])!.isInvalidated),
		submit: async (input: HarnessAccountCreate) => {
			await act(async () => form.onSubmit(input));
			await act(async () => {
				await new Promise((resolve) => setTimeout(resolve, 10));
			});
		},
	};
}

test("account creation retains the name and harness, sends the profile path, then selects the saved account", async () => {
	const account = { id: "new-account", name: "New work", harness: "codex" } as HarnessAccount;
	const calls: HarnessAccountCreate[] = [];
	const f = await fixture(async (input) => {
		calls.push(input);
		return account;
	});
	expect(form).toMatchObject({ initialName: "New work", initialHarness: "codex", lockHarness: true });
	const input = { name: "New work", harness: "codex", profilePath: "/profiles/work" } as const;
	await f.submit(input);
	expect(calls).toEqual([input]);
	expect(f.picked).toEqual([account]);
	expect(f.invalidated()).toEqual([true, true, true]);
});

test("an account creation refusal leaves the form open with its name and an error", async () => {
	const f = await fixture(async () => {
		throw new Error("The profile path is unavailable.");
	});
	await f.submit({ name: "New work", harness: "codex" });
	expect(form.initialName).toBe("New work");
	expect(form.error).toBe("The profile path is unavailable.");
	expect(f.picked).toEqual([]);
	expect(f.invalidated()).toEqual([false, false, false]);
});

for (const change of ["close", "unmount", "scope", "harness"] as const) {
	test(`a late created account does not select after ${change}`, async () => {
		const pending = Promise.withResolvers<HarnessAccount>();
		const f = await fixture(() => pending.promise);
		await f.submit({ name: "New work", harness: "codex" });
		if (change === "close") await f.close();
		if (change === "unmount") await f.unmount();
		if (change === "scope") {
			await f.render("child");
			await f.render("parent");
		}
		if (change === "harness") {
			await f.render("parent", "claude");
			await f.render();
		}
		await act(async () => {
			pending.resolve({ id: "created" } as HarnessAccount);
			await pending.promise;
			await new Promise((resolve) => setTimeout(resolve, 10));
		});
		expect(f.picked).toEqual([]);
		expect(f.invalidated()).toEqual([true, true, true]);
	});
}

test("a context change while account queries refresh prevents selection", async () => {
	const pending = Promise.withResolvers<void>();
	const f = await fixture(async () => ({ id: "created" }) as HarnessAccount);
	f.queryClient.invalidateQueries = async () => pending.promise;
	await f.submit({ name: "New work", harness: "codex" });
	await f.render("child");
	await act(async () => {
		pending.resolve();
		await pending.promise;
		await new Promise((resolve) => setTimeout(resolve, 10));
	});
	expect(f.picked).toEqual([]);
});
