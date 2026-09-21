import { Clock } from "@phosphor-icons/react";
import { useInfiniteQuery } from "@tanstack/react-query";
import type { NeedsYouListInput } from "@trellis/api";
import { Command, toast } from "@trellis/ui";
import { useState } from "react";
import { useActor } from "../../../../../lib/actor";
import { useApp } from "../../../../../lib/appContext";
import { parseSnooze } from "../../../../needs-you/parseSnooze";
import { useNeedsYouUpdate } from "../../../../needs-you/useNeedsYou";
import { commandActions, useCommandStore } from "../../../commandStore";

const format = (date: Date) =>
	new Intl.DateTimeFormat(undefined, { dateStyle: "full", timeStyle: "short" }).format(date);
const presets = ["1 hour", "tomorrow", "next week", "1 month"];

export function SnoozeGroup({ query, setQuery }: { query: string; setQuery: (query: string) => void }) {
	const { orpc } = useApp();
	const actor = useActor();
	const target = useCommandStore((state) => state.snoozeItem);
	const match = /^snooze\s+([a-z][a-z0-9]*-[1-9][0-9]*)(?:\s+(.*))?$/i.exec(query.trim());
	const identifier = match?.[1]?.toUpperCase();
	const text = match?.[2] ?? "";
	const exactTarget = target?.identifier === identifier ? target : null;
	const options = orpc.needsYou.list.infiniteOptions({
		input: (cursor: NeedsYouListInput["cursor"]) => ({ ticket: identifier, cursor }),
		initialPageParam: null,
		getNextPageParam: (page) => page.nextCursor,
		enabled: !!identifier && !exactTarget,
	});
	const lookup = useInfiniteQuery({ ...options, queryKey: [...options.queryKey, actor?.name] });
	const mutation = useNeedsYouUpdate();
	const [reference] = useState(() => new Date());
	const parsed = parseSnooze(text, reference);
	const confirm = (id: string) => {
		if (mutation.isPending || !parsed.date || parsed.error) return;
		mutation.mutate(
			{ id, action: "snooze", until: parsed.date.toISOString() },
			{
				onSuccess: () => {
					toast.success(`Snoozed ${identifier} until ${format(parsed.date!)}`);
					commandActions.close();
				},
			},
		);
	};
	if (!identifier)
		return (
			<Command.Group heading="Snooze a Needs you item">
				<Command.Empty>Type Snooze TR-123 followed by a time.</Command.Empty>
			</Command.Group>
		);
	if (text === "")
		return (
			<Command.Group heading={`Snooze ${identifier}`}>
				{presets.map((preset) => (
					<Command.Row
						key={preset}
						value={preset}
						icon={<Clock />}
						label={preset}
						sub={format(parseSnooze(preset, reference).date!)}
						onSelect={() => setQuery(`Snooze ${identifier} ${preset}`)}
					/>
				))}
				<Command.Empty>Type any duration or date.</Command.Empty>
			</Command.Group>
		);
	if (parsed.error)
		return (
			<Command.Group heading="Snooze">
				<Command.Empty>{parsed.error}</Command.Empty>
			</Command.Group>
		);
	if (!exactTarget && lookup.isPending) return <Command.Empty>Find items for {identifier}…</Command.Empty>;
	if (!exactTarget && lookup.error) return <Command.Empty>{lookup.error.message}</Command.Empty>;
	const choices = exactTarget
		? [{ id: exactTarget.id, label: identifier }]
		: (lookup.data?.pages.flatMap((page) => page.items) ?? []).map((item) => ({
				id: item.id,
				label: "Needs review",
			}));
	return (
		<Command.Group
			heading={
				mutation.isPending ? "Save snooze…" : `${identifier} · ${Intl.DateTimeFormat().resolvedOptions().timeZone}`
			}
		>
			{choices.length === 0 && <Command.Empty>No active Needs you items for {identifier}.</Command.Empty>}
			{choices.map((choice) => (
				<Command.Row
					key={choice.id}
					value={choice.id}
					icon={<Clock />}
					label={`Snooze until ${format(parsed.date!)}`}
					sub={choice.label}
					onSelect={() => confirm(choice.id)}
				/>
			))}
			{!exactTarget && lookup.hasNextPage && (
				<Command.Row
					value="load-more"
					label={lookup.isFetchingNextPage ? "Load items…" : "More items"}
					onSelect={() => {
						if (!lookup.isFetchingNextPage) void lookup.fetchNextPage();
					}}
				/>
			)}
		</Command.Group>
	);
}
