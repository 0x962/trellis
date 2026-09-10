import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { Hash } from "lucide-react";
import { NameStep } from "../features/setup/NameStep";
import { ProjectStep } from "../features/setup/ProjectStep";
import { useActor } from "../lib/actor";
import { useApp } from "../lib/appContext";
import { resolveActor } from "../lib/identity";

type SetupSearch = { step?: "project" };

// The first run: a name, then the first project. `?step=project` names the
// second step, so the same form serves a later new project. A server that
// stores a name or holds a project skips the name step, and a server with
// projects skips the first-project step.
export const Route = createFileRoute("/setup")({
	validateSearch: (search: Record<string, unknown>): SetupSearch =>
		search.step === "project" ? { step: "project" } : {},
	beforeLoad: async ({ context, search }) => {
		const [projects, identity] = await Promise.all([
			context.queryClient.fetchQuery(context.orpc.projects.list.queryOptions({ input: {} })),
			context.queryClient.ensureQueryData(context.orpc.actors.default.queryOptions({})),
			context.queryClient.ensureQueryData(context.orpc.settings.get.queryOptions()),
		]);
		if (!(await resolveActor(context, identity, projects.length)) || search.step === "project") return;
		if (projects.length > 0) throw redirect({ to: "/needs-you", replace: true });
		throw redirect({ to: "/setup", search: { step: "project" }, replace: true });
	},
	component: SetupPage,
});

function SetupPage() {
	const navigate = useNavigate();
	const { client, orpc, queryClient } = useApp();
	const actor = useActor();
	const projects = useSuspenseQuery(orpc.projects.list.queryOptions({ input: {} })).data;
	const identity = useSuspenseQuery(orpc.actors.default.queryOptions({})).data;
	const roots = projects.filter((project) => project.parentId === null);

	const create = async (input: { key: string; name: string }) => {
		await client.projects.create(input);
		await queryClient.invalidateQueries({ queryKey: orpc.projects.list.key() });
		await navigate({ to: "/p/$", params: { _splat: input.key } });
	};

	return (
		<div className="flex h-full items-center justify-center bg-bg p-5">
			<div className="flex w-100 max-w-full flex-col gap-6 rounded-lg border border-border bg-surface p-6 shadow-sm">
				<div className="flex items-center gap-2">
					<span aria-hidden="true" className="inline-flex size-4 text-accent *:size-full">
						<Hash />
					</span>
					<span className="font-mono text-md font-medium text-fg">trellis</span>
					<span className="ml-auto text-xs text-fg-faint tabular">Step {actor === null ? 1 : 2} of 2</span>
				</div>
				{actor === null ? (
					<NameStep
						suggested={identity.name}
						onDone={() => navigate({ to: "/setup", search: { step: "project" }, replace: true })}
					/>
				) : (
					<ProjectStep
						taken={projects.map((project) => project.key)}
						takenNames={roots.map((project) => project.name)}
						onCreate={create}
					/>
				)}
			</div>
		</div>
	);
}
