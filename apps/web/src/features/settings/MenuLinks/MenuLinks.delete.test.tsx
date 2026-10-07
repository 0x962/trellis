import { afterAll, afterEach, expect, mock, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Settings } from "@trellis/api";
import { act, type ComponentProps, type ReactNode, type Ref, useImperativeHandle } from "react";
import { createRoot, type TestInstance } from "test-renderer";
import { type AppContext, AppProvider } from "../../../lib/appContext";

let retryWrite: (() => void) | undefined;

mock.module("@trellis/ui", () => ({
	Button: ({ processing, ...props }: ComponentProps<"button"> & { processing?: boolean }) => (
		<button {...props} disabled={props.disabled || processing} aria-busy={processing || undefined} />
	),
	ConfirmDialog: ({
		open,
		title,
		description,
		confirmLabel,
		processing,
		children,
		onConfirm,
		onCancel,
	}: {
		open: boolean;
		title: string;
		description: string;
		confirmLabel: string;
		processing?: boolean;
		children?: ReactNode;
		onConfirm: () => void;
		onCancel: () => void;
	}) =>
		open ? (
			<section role="dialog">
				<h2>{title}</h2>
				<p>{description}</p>
				{children}
				<button type="button" disabled={processing} onClick={onCancel}>
					Cancel
				</button>
				<button type="button" disabled={processing} aria-busy={processing || undefined} onClick={onConfirm}>
					{confirmLabel}
				</button>
			</section>
		) : null,
	EmptyState: ({ title }: { title: string }) => <p>{title}</p>,
	FormStatus: ({ status, message }: { status: string; message?: string }) => (
		<p role={status === "error" ? "alert" : "status"}>
			{message ?? (status === "saving" ? "Save in progress" : status === "saved" ? "Saved" : "")}
		</p>
	),
	IconButton: ({ label, disabled, onClick }: { label: string; disabled?: boolean; onClick?: () => void }) => (
		<button type="button" aria-label={label} disabled={disabled} onClick={onClick} />
	),
	Input: ({
		label,
		error,
		ref,
		disabled,
	}: {
		label: string;
		error?: string;
		ref?: Ref<HTMLInputElement>;
		disabled?: boolean;
	}) => {
		useImperativeHandle(ref, () => ({ focus() {} }) as HTMLInputElement);
		const id = `field-${label.toLowerCase().replaceAll(" ", "-")}`;
		return (
			<div>
				<label htmlFor={id}>{label}</label>
				<input
					id={id}
					disabled={disabled}
					aria-invalid={error === undefined ? undefined : true}
					aria-describedby={error === undefined ? undefined : `${id}-hint`}
				/>
				{error !== undefined && (
					<p id={`${id}-hint`} role="alert">
						{error}
					</p>
				)}
			</div>
		);
	},
	Menu: ({
		items,
		trigger,
	}: {
		items: { label: string; disabled?: boolean; onSelect: () => void }[];
		trigger: ReactNode;
	}) => (
		<>
			{trigger}
			{items.map((item) => (
				<button key={item.label} type="button" disabled={item.disabled} onClick={item.onSelect}>
					{item.label}
				</button>
			))}
		</>
	),
	Select: ({ label }: { label: string }) => <select aria-label={label} />,
	SettingsListRow: ({
		label,
		description,
		actions,
		children,
	}: {
		label: string;
		description: string;
		actions: ReactNode;
		children?: ReactNode;
	}) => (
		<li>
			<span>{label}</span>
			<span>{description}</span>
			{actions}
			{children}
		</li>
	),
	Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
	toast: {
		error: (
			_title: string,
			options: {
				action: { onClick: () => void };
			},
		) => {
			retryWrite = options.action.onClick;
		},
	},
}));
const { MenuLinks } = await import("./MenuLinks");

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let dispose = async () => {};
afterEach(async () => {
	await dispose();
	retryWrite = undefined;
});
afterAll(() => mock.restore());

const text = (node: TestInstance): string =>
	node.children.map((child) => (typeof child === "string" ? child : text(child))).join("");

const button = (root: ReturnType<typeof createRoot>, label: string) =>
	root.container.queryAll(
		(node) => node.type === "button" && (text(node) === label || node.props["aria-label"] === label),
	)[0]!;

const link = {
	id: "83a7ed37-b3f4-4ba2-8e10-b1f91eedb41f",
	label: "Actions",
	icon: "GithubLogo",
	url: "https://github.com/0x962/trellis/actions",
} as const;
const settings: Settings = { defaultActorName: "test", menuLinks: [link] };
const stored: Settings = { ...settings, menuLinks: [] };

async function mount(write: (input: Settings) => Promise<Settings>) {
	const queryClient = new QueryClient();
	const savedKey = ["settings"];
	queryClient.setQueryData(savedKey, settings);
	const app = {
		queryClient,
		client: { settings: { set: write } },
		orpc: {
			settings: {
				get: {
					queryKey: () => savedKey,
					queryOptions: () => ({ queryKey: savedKey, queryFn: async () => settings }),
				},
			},
		},
	} as unknown as AppContext;
	const root = createRoot();
	dispose = async () => {
		await act(async () => root.unmount());
		queryClient.clear();
	};
	await act(async () => {
		root.render(
			<QueryClientProvider client={queryClient}>
				<AppProvider value={app}>
					<MenuLinks />
				</AppProvider>
			</QueryClientProvider>,
		);
	});
	return root;
}

const settle = () =>
	act(async () => {
		await new Promise((resolve) => setTimeout(resolve, 0));
	});

async function submitDelete(root: ReturnType<typeof createRoot>) {
	await act(async () => button(root, "Delete").props.onClick());
	expect(text(root.container)).toContain("Delete Actions?");
	expect(text(root.container)).toContain(link.url);
	await act(async () => {
		button(root, "Delete menu link").props.onClick();
	});
	await settle();
}

async function retry() {
	expect(retryWrite).toBeDefined();
	await act(async () => {
		retryWrite!();
		await Promise.resolve();
	});
}

test("a failed delete keeps the link and the confirmation open", async () => {
	const calls: Settings[] = [];
	const root = await mount(async (input) => {
		calls.push(input);
		throw new Error("The host refused the write.");
	});

	await submitDelete(root);

	expect(calls).toHaveLength(1);
	expect(calls[0]!.menuLinks).toEqual([]);
	expect(text(root.container)).toContain(link.url);
	expect(text(root.container)).toContain("Delete Actions?");
	expect(text(root.container)).toContain("The menu link did not delete.");
	expect(button(root, "Delete menu link").props.disabled).toBeFalsy();
	expect(retryWrite).toBeDefined();
});

test("a pending Retry locks save and delete actions and rejects a concurrent Retry", async () => {
	let attempts = 0;
	let finish!: (value: Settings) => void;
	const pending = new Promise<Settings>((resolve) => {
		finish = resolve;
	});
	const root = await mount(async () => {
		attempts += 1;
		if (attempts === 1) throw new Error("The host refused the first write.");
		return pending;
	});
	await act(async () => button(root, "Edit").props.onClick());
	await submitDelete(root);

	await retry();

	expect(attempts).toBe(2);
	expect(text(root.container)).toContain(link.url);
	expect(text(root.container)).not.toContain("The menu link did not delete.");
	expect(button(root, "Save").props.disabled).toBe(true);
	expect(button(root, "Delete").props.disabled).toBe(true);
	expect(button(root, "Delete menu link").props.disabled).toBe(true);
	expect(button(root, "Delete menu link").props["aria-busy"]).toBe(true);
	expect(button(root, "Actions for Actions").props.disabled).toBe(true);
	for (const cancel of root.container.queryAll((node) => node.type === "button" && text(node) === "Cancel")) {
		expect(cancel.props.disabled).toBe(true);
	}
	await retry();
	expect(attempts).toBe(2);

	await act(async () => {
		finish(stored);
		await pending;
		await Promise.resolve();
	});
});

test("a successful Retry removes the link and closes the confirmation", async () => {
	let attempts = 0;
	const root = await mount(async () => {
		attempts += 1;
		if (attempts === 1) throw new Error("The host refused the first write.");
		return stored;
	});
	await submitDelete(root);

	await retry();
	await settle();

	expect(attempts).toBe(2);
	expect(text(root.container)).not.toContain(link.url);
	expect(text(root.container)).not.toContain("Delete Actions?");
});
