import { afterAll, afterEach, expect, mock, test } from "bun:test";
import type { Project, ProjectSetReposInput, ProjectUpdateInput } from "@trellis/api";
import { act, type ComponentProps, type ReactNode, useEffect, useImperativeHandle, useRef } from "react";
import { createRoot } from "test-renderer";
import { type AppContext, AppProvider } from "../../../lib/appContext";

type ConfirmProps = {
	open: boolean;
	title: string;
	description: string;
	confirmLabel: string;
	processing?: boolean;
	children?: ReactNode;
	finalFocus?: () => HTMLElement | true | null;
	onConfirm: () => void;
	onCancel: () => void;
};

const focusCalls: string[] = [];

mock.module("@tanstack/react-query", () => ({
	useSuspenseQuery: () => ({ data: [] }),
}));
mock.module("@tanstack/react-router", () => ({
	useNavigate: () => async () => {},
}));
mock.module("@trellis/ui", () => ({
	Button: ({ processing, ref, children, ...props }: ComponentProps<"button"> & { processing?: boolean }) => {
		useImperativeHandle(ref, () => ({ focus: () => focusCalls.push(String(children)) }) as HTMLButtonElement, [
			children,
		]);
		return (
			<button {...props} data-processing={processing || undefined} disabled={props.disabled === true || processing}>
				{children}
			</button>
		);
	},
	ConfirmDialog: ({
		open,
		title,
		description,
		confirmLabel,
		processing,
		children,
		onConfirm,
		onCancel,
		finalFocus,
	}: ConfirmProps) => {
		const previousOpen = useRef(open);
		useEffect(() => {
			const closed = previousOpen.current && !open;
			previousOpen.current = open;
			if (!closed) return;
			const target = finalFocus?.();
			if (target === true) focusCalls.push("Remove opener");
			else target?.focus();
		}, [finalFocus, open]);
		return open ? (
			<section role="dialog" data-processing={processing || undefined}>
				<h2>{title}</h2>
				<p>{description}</p>
				{children}
				<button type="button" disabled={processing} onClick={onCancel}>
					Cancel
				</button>
				<button type="button" disabled={processing} onClick={onConfirm}>
					{confirmLabel}
				</button>
			</section>
		) : null;
	},
	FieldHint: ({ children }: { children: ReactNode }) => <p>{children}</p>,
	FormStatus: ({ message }: { message?: string }) => (
		<p role="alert" data-form-status>
			{message}
		</p>
	),
	GithubMark: () => <span />,
	IconButton: ({ label, icon: _icon, ...props }: ComponentProps<"button"> & { label: string; icon: ReactNode }) => (
		<button {...props} aria-label={label} />
	),
	Input: ({ label, error, ...props }: ComponentProps<"input"> & { label: string; error?: string }) => (
		<label data-field={label}>
			{label}
			<input aria-label={label} {...props} />
			{error && <span role="alert">{error}</span>}
		</label>
	),
	ProjectColorField: ({ value }: { value: string | null }) => <p>Color: {value}</p>,
	Textarea: ({ label, ...props }: ComponentProps<"textarea"> & { label: string }) => (
		<label>
			{label}
			<textarea aria-label={label} {...props} />
		</label>
	),
}));

const { ProjectDetailsForm } = await import("../ProjectDetailsForm/ProjectDetailsForm");
const { RepoSettings } = await import("./RepoSettings");
afterAll(() => mock.restore());
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const project = (): Project =>
	({
		id: "01K00000000000000000000000",
		key: "TRL",
		slug: "trellis",
		name: "Trellis",
		description: "Saved description",
		color: "blue",
		ticketCounter: 0,
		repos: [
			{ id: "01K00000000000000000000001", projectId: "01K00000000000000000000000", owner: "0x962", repo: "trellis" },
			{ id: "01K00000000000000000000002", projectId: "01K00000000000000000000000", owner: "0x962", repo: "agents" },
		],
	}) as Project;

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
	for (const close of cleanups.splice(0)) await close();
});

async function fixture(setRepos: (input: ProjectSetReposInput) => Promise<Project>) {
	const current = project();
	const invalidations: number[] = [];
	const app = {
		client: { projects: { setRepos } },
		queryClient: {
			invalidateQueries: async () => {
				invalidations.push(1);
			},
		},
	} as unknown as AppContext;
	const root = createRoot();
	await act(async () =>
		root.render(
			<AppProvider value={app}>
				<RepoSettings project={current} />
			</AppProvider>,
		),
	);
	cleanups.push(() => act(async () => root.unmount()));
	const query = (type: string) => root.container.queryAll((node) => node.type === type);
	const button = (label: string) =>
		query("button").find((node) => node.children.join("") === label || node.props["aria-label"] === label)!;
	return {
		current,
		invalidations,
		button,
		input: () => query("input")[0]!,
		field: () => query("label")[0]!,
		form: () => query("form")[0]!,
		dialog: () => query("section").find((node) => node.props.role === "dialog"),
		dialogTitle: () => query("h2")[0]?.children.join(""),
		fieldError: () =>
			query("span")
				.find((node) => node.props.role === "alert")
				?.children.join(""),
		formStatus: () =>
			query("p")
				.find((node) => node.props["data-form-status"] !== undefined)
				?.children.join(""),
	};
}

async function detailsFixture(update: (input: ProjectUpdateInput) => Promise<Project>) {
	const current = project();
	const invalidations: number[] = [];
	const app = {
		client: { projects: { update } },
		orpc: { projects: { list: { queryOptions: () => ({}) } } },
		queryClient: { invalidateQueries: async () => void invalidations.push(1) },
	} as unknown as AppContext;
	const root = createRoot();
	await act(async () =>
		root.render(
			<AppProvider value={app}>
				<ProjectDetailsForm project={current} />
			</AppProvider>,
		),
	);
	cleanups.push(() => act(async () => root.unmount()));
	const query = (type: string) => root.container.queryAll((node) => node.type === type);
	const input = (label: string) => query("input").find((node) => node.props["aria-label"] === label)!;
	return {
		current,
		invalidations,
		input,
		textarea: () => query("textarea")[0]!,
		form: () => query("form")[0]!,
		saveButton: () => query("button")[0]!,
		text: () => JSON.stringify(root.container.toJSON()),
	};
}

test("Save project shows processing and rejects a second submit", async () => {
	const calls: ProjectUpdateInput[] = [];
	let finish!: (value: Project) => void;
	const f = await detailsFixture(
		(input) =>
			new Promise((resolve) => {
				calls.push(input);
				finish = resolve;
			}),
	);
	await act(async () => {
		f.form().props.onSubmit({ preventDefault() {} });
		f.form().props.onSubmit({ preventDefault() {} });
	});
	expect(calls).toHaveLength(1);
	expect(f.saveButton().props.disabled).toBe(true);
	expect(f.saveButton().props["data-processing"]).toBe(true);
	await act(async () => finish(f.current));
	expect(f.invalidations).toHaveLength(1);
});

test("an add format error stays on the Repository field", async () => {
	const calls: ProjectSetReposInput[] = [];
	const f = await fixture(async (input) => {
		calls.push(input);
		return f.current;
	});
	await act(async () => f.input().props.onChange({ target: { value: "not a repository" } }));
	await act(async () => f.form().props.onSubmit({ preventDefault() {} }));
	expect(calls).toEqual([]);
	expect(f.fieldError()).toBe("Use a GitHub URL or owner/repository.");
	expect(f.dialog()).toBeUndefined();
});

test("repository removal confirms, locks writes, and rejects a second request", async () => {
	const calls: ProjectSetReposInput[] = [];
	let reject!: (error: Error) => void;
	const f = await fixture(
		(input) =>
			new Promise((_, fail) => {
				calls.push(input);
				reject = fail;
			}),
	);
	const saved = structuredClone(f.current);
	await act(async () => f.button("Remove 0x962/trellis").props.onClick());
	expect(f.dialog()).toBeDefined();
	expect(f.dialogTitle()).toBe("Remove 0x962/trellis?");
	await act(async () => {
		f.button("Remove repository").props.onClick();
		f.button("Remove repository").props.onClick();
	});
	expect(calls).toEqual([{ project: "TRL", repos: [{ owner: "0x962", repo: "agents" }] }]);
	expect(f.button("Add repository").props.disabled).toBe(true);
	expect(f.button("Remove 0x962/trellis").props.disabled).toBe(true);
	expect(f.button("Remove 0x962/agents").props.disabled).toBe(true);
	expect(f.input().props.disabled).toBe(true);
	expect(f.dialog()?.props["data-processing"]).toBe(true);
	await act(async () => reject(new Error("Repository removal refused")));
	expect(f.dialog()).toBeDefined();
	expect(f.fieldError()).toBeUndefined();
	expect(f.formStatus()).toBe("Repository removal refused");
	expect(f.current).toEqual(saved);
	expect(f.invalidations).toEqual([]);
});

test("cancelled repository removal returns focus to the Remove opener", async () => {
	focusCalls.length = 0;
	const f = await fixture(async () => f.current);
	await act(async () => f.button("Remove 0x962/trellis").props.onClick());
	expect(f.dialog()).toBeDefined();
	await act(async () => f.button("Cancel").props.onClick());
	expect(f.dialog()).toBeUndefined();
	expect(focusCalls).toEqual(["Remove opener"]);
});

test("successful repository removal returns focus to Add repository", async () => {
	focusCalls.length = 0;
	const f = await fixture(async () => f.current);
	await act(async () => f.button("Remove 0x962/trellis").props.onClick());
	expect(f.dialog()).toBeDefined();
	await act(async () => {
		f.button("Remove repository").props.onClick();
		await Promise.resolve();
	});
	expect(f.dialog()).toBeUndefined();
	expect(focusCalls).toEqual(["Add repository"]);
});

test("a failed project request keeps the saved project and every draft field", async () => {
	const calls: ProjectUpdateInput[] = [];
	const f = await detailsFixture(async (input) => {
		calls.push(input);
		throw new Error("Project save refused");
	});
	const saved = structuredClone(f.current);
	await act(async () => {
		f.input("Project name").props.onChange({ target: { value: "  Draft project  " } });
		f.input("Key").props.onChange({ target: { value: "new" } });
		f.textarea().props.onChange({ target: { value: "Draft description" } });
	});
	await act(async () => {
		f.form().props.onSubmit({ preventDefault() {} });
		await Promise.resolve();
	});
	expect(calls[0]).toMatchObject({ name: "Draft project", key: "NEW", description: "Draft description" });
	expect(f.input("Project name").props.value).toBe("  Draft project  ");
	expect(f.input("Key").props.value).toBe("new");
	expect(f.textarea().props.value).toBe("Draft description");
	expect(f.current).toEqual(saved);
	expect(f.invalidations).toEqual([]);
	expect(f.text()).toContain("Project save refused");
});
