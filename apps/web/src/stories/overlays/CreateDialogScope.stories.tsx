import type { Meta, StoryObj } from "@storybook/react-vite";
import { QueryClient, QueryClientProvider, useIsMutating } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { CreateProjectDialog } from "../../features/project-actions/CreateProjectDialog";
import { StatusCreateDialog } from "../../features/project-settings/StatusCreateDialog";
import { type AppContext, AppProvider, useApp } from "../../lib/appContext";
import { project, statuses } from "./fixtures";

const meta = {
	title: "Overlays/CreateDialogScope",
	args: { kind: "project" as "project" | "status" },
	render: function Render({ kind }) {
		const outer = useApp();
		const [scope, setScope] = useState("FIRST");
		const [selected, setSelected] = useState("Nothing selected");
		const [invalidations, setInvalidations] = useState(0);
		const [{ app, finish }] = useState(() => {
			const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
			let finish!: () => void;
			const delayed = new Promise<void>((resolve) => {
				finish = resolve;
			});
			queryClient.invalidateQueries = async () => {
				setInvalidations((count) => count + 1);
				await delayed;
			};
			const app = {
				...outer,
				queryClient,
				client: {
					projects: { create: async () => ({ ...project, name: "Research", key: "RE" }) },
					statuses: { create: async () => ({ ...statuses[0]!, name: "Release" }) },
				},
				orpc: {
					projects: {
						key: () => ["projects"],
						list: { queryOptions: () => ({ queryKey: ["projects"], queryFn: async () => [] }) },
					},
					statuses: { key: () => ["statuses"] },
				},
			} as unknown as AppContext;
			return { app, finish };
		});
		const mutations = useIsMutating({}, app.queryClient);
		useEffect(() => () => app.queryClient.clear(), [app]);
		return (
			<QueryClientProvider client={app.queryClient}>
				<AppProvider value={app}>
					<button type="button" onClick={() => setScope("SECOND")}>
						Change scope
					</button>
					<button type="button" onClick={finish}>
						Finish refresh
					</button>
					<output aria-label="Refresh count">{invalidations}</output>
					<output aria-label="Pending mutations">{mutations}</output>
					<output aria-label="Current scope">{scope}</output>
					<output aria-label="Selected record">{selected}</output>
					{kind === "project" ? (
						<CreateProjectDialog
							scope={scope}
							initialName="Research"
							onCreated={(item) => setSelected(item.name)}
							onClose={() => {}}
						/>
					) : (
						<StatusCreateDialog
							project={scope}
							initialName="Release"
							onCreated={(item) => setSelected(item.name)}
							onClose={() => {}}
						/>
					)}
				</AppProvider>
			</QueryClientProvider>
		);
	},
} satisfies Meta<{ kind: "project" | "status" }>;
export default meta;
type Story = StoryObj<typeof meta>;

export const ProjectScopeChangesDuringRefresh: Story = {
	play: async ({ canvasElement }) => {
		const page = within(canvasElement.ownerDocument.body);
		const canvas = within(canvasElement);
		await userEvent.click(await page.findByRole("button", { name: /^Create/ }));
		await waitFor(() => expect(canvas.getByLabelText("Refresh count")).toHaveTextContent("1"));
		canvas.getByText("Change scope", { selector: "button" }).click();
		await waitFor(() => expect(canvas.getByLabelText("Current scope")).toHaveTextContent("SECOND"));
		canvas.getByText("Finish refresh", { selector: "button" }).click();
		await waitFor(() => expect(canvas.getByLabelText("Pending mutations")).toHaveTextContent("0"));
		await expect(canvas.getByLabelText("Selected record")).toHaveTextContent("Nothing selected");
	},
};
export const StatusScopeChangesDuringRefresh: Story = {
	args: { kind: "status" },
	play: async ({ canvasElement }) => {
		const page = within(canvasElement.ownerDocument.body);
		const canvas = within(canvasElement);
		const create = await page.findByRole("button", { name: "Create status" });
		await userEvent.click(create);
		await waitFor(() => expect(canvas.getByLabelText("Refresh count")).toHaveTextContent("2"));
		canvas.getByText("Change scope", { selector: "button" }).click();
		await waitFor(() => expect(canvas.getByLabelText("Current scope")).toHaveTextContent("SECOND"));
		canvas.getByText("Finish refresh", { selector: "button" }).click();
		await waitFor(() => expect(create).toBeEnabled());
		await expect(canvas.getByLabelText("Selected record")).toHaveTextContent("Nothing selected");
	},
};
