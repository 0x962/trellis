import { ORPCError } from "@orpc/client";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Button, Command, type CommandGroup, Popover } from "@trellis/ui";
import { Plus } from "lucide-react";
import { useRef, useState } from "react";
import { useApp } from "../../../../../lib/appContext";
import { personaKinds } from "../../../../personas/PersonasPage/kinds";

export function PersonaPicker({ ticket, disabled }: { ticket: string; disabled: boolean }) {
	const { client, orpc, queryClient } = useApp();
	const [open, setOpen] = useState(false);
	const [search, setSearch] = useState("");
	const input = useRef<HTMLInputElement>(null);
	const busy = useRef(false);
	const personas = useQuery({ ...orpc.personas.list.queryOptions({ input: {} }), enabled: open });
	const history = useQuery({ ...orpc.agentRuns.list.queryOptions({ input: {} }), enabled: open });
	const start = useMutation({
		mutationFn: (personaId: string) => client.agentRuns.start({ personaId, ticket }),
		onSuccess: async (run) => {
			if (run.state === "running" || run.state === "interrupted") setOpen(false);
			await queryClient.invalidateQueries({ queryKey: orpc.agentRuns.list.key() });
		},
		onSettled: () => {
			busy.current = false;
		},
	});
	const choices = (personas.data ?? []).filter((persona) => persona.kind !== "manager");
	const counts = new Map<string, number>();
	for (const run of history.data ?? []) {
		if (run.personaId !== null && run.state !== "failed")
			counts.set(run.personaId, (counts.get(run.personaId) ?? 0) + 1);
	}
	const frequent = choices
		.filter((persona) => counts.has(persona.id))
		.sort((a, b) => counts.get(b.id)! - counts.get(a.id)! || a.name.localeCompare(b.name))
		.slice(0, 5);
	const frequentIds = new Set(frequent.map((persona) => persona.id));
	const item = (persona: (typeof choices)[number]) => ({
		id: persona.id,
		label: persona.name,
		keywords: [persona.kind],
	});
	const groups: CommandGroup[] = [
		...(frequent.length ? [{ heading: "Frequently Used", items: frequent.map(item) }] : []),
		...personaKinds
			.filter((kind) => kind.value !== "manager")
			.map((kind) => ({
				heading: kind.plural,
				items: choices
					.filter((persona) => persona.kind === kind.value && !frequentIds.has(persona.id))
					.sort((a, b) => a.name.localeCompare(b.name))
					.map(item),
			})),
	];
	const loading = personas.isPending || history.isPending;
	const loadError = personas.error ?? history.error;
	const startError =
		start.error instanceof ORPCError && start.error.code === "INPUT_VALIDATION_FAILED"
			? (start.error.data as { issues: { message: string }[] }).issues[0]!.message
			: start.error?.message;
	const error = startError ?? (start.data?.state === "failed" ? start.data.error : null);
	return (
		<Popover
			label="Assign a persona"
			open={open}
			initialFocus={input}
			overlapTrigger
			onOpenChange={(next) => {
				if (!busy.current) {
					setOpen(next);
					if (next) {
						start.reset();
						setSearch("");
					}
				}
			}}
			className="w-80 max-w-[calc(100vw-var(--spacing)*8)] p-0"
			trigger={
				<Button variant="quiet" align="start" icon={<Plus />} className="-ml-2.5" disabled={disabled}>
					New agent
				</Button>
			}
		>
			<div aria-busy={start.isPending}>
				<Command
					inputRef={input}
					label="Search personas"
					placeholder="Select a persona…"
					listClassName="max-h-80 pointer-coarse:[&_[cmdk-item]]:h-11"
					filter={false}
					onSearchChange={setSearch}
					groups={
						loading || loadError
							? []
							: groups
									.map((group) => ({
										...group,
										items: group.items.filter((item) =>
											`${item.label} ${item.keywords?.join(" ")}`.toLowerCase().includes(search.trim().toLowerCase()),
										),
									}))
									.filter((group) => group.items.length > 0)
					}
					empty={loading ? "Load personas…" : loadError ? "Could not load personas." : "No personas found."}
					onSelect={(id) => {
						if (!busy.current) {
							busy.current = true;
							start.mutate(id);
						}
					}}
				/>
				{loadError && (
					<p role="alert" className="px-3 py-2 text-sm text-danger">
						{loadError.message}{" "}
						<Button
							variant="quiet"
							onClick={() => {
								void personas.refetch();
								void history.refetch();
							}}
						>
							Retry
						</Button>
					</p>
				)}
				{!loading && !loadError && choices.length === 0 && (
					<p className="px-3 py-2 text-sm text-fg-muted">
						Create a builder or reviewer persona first.{" "}
						<Link to="/ai/personas" className="text-accent underline">
							Open Personas
						</Link>
					</p>
				)}
				{start.isPending && (
					<p role="status" className="px-3 py-2 text-sm text-fg-muted">
						Start agent…
					</p>
				)}
				{error && (
					<p role="alert" className="px-3 py-2 text-sm text-danger">
						Could not start the agent. {error}
					</p>
				)}
			</div>
		</Popover>
	);
}
