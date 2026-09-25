import { ChatCircle, Eye, FunnelSimple, PushPinSimple, User } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { Chip, type CommandItem, FilterBar, FilterPopover, IconButton, Input, useHotkey } from "@trellis/ui";
import { type ReactElement, useEffect, useMemo, useState } from "react";
import { useApp } from "../../../../../lib/appContext";
import { searchDebounceMs } from "../../../../command/hooks/useCommandSearch";
import type { PageSearch } from "../../pageSearch";

type PageFilter = Exclude<keyof PageSearch, "q">;
type Stage = "fields" | PageFilter;

const labels: Record<PageFilter, string> = {
	author: "Author",
	watcher: "Watcher",
	comment: "Comments",
	pin: "Pin",
};

const icons: Record<PageFilter, ReactElement> = {
	author: <User />,
	watcher: <Eye />,
	comment: <ChatCircle />,
	pin: <PushPinSimple />,
};

const fieldItems: CommandItem[] = (Object.keys(labels) as PageFilter[]).map((field) => ({
	id: field,
	label: labels[field],
	icon: icons[field],
}));

export function PageListFilters({
	projectId,
	search,
	onChange,
}: {
	projectId: string;
	search: PageSearch;
	onChange: (next: PageSearch) => void;
}) {
	const { orpc, scheduler } = useApp();
	const [open, setOpen] = useState(false);
	const [stage, setStage] = useState<Stage>("fields");
	const [draft, setDraft] = useState(search.q ?? "");
	const actors = useQuery({
		...orpc.actors.list.queryOptions({ input: {} }),
		enabled: open && stage === "author",
	});
	const runs = useQuery({
		...orpc.agentRuns.list.queryOptions({ input: { project: projectId, assigned: true, limit: 1000 } }),
		enabled: open && stage === "watcher",
	});

	useEffect(() => setDraft(search.q ?? ""), [search.q]);
	useEffect(() => {
		const q = draft.trim();
		if (q === (search.q ?? "")) return;
		const handle = scheduler.setTimeout(() => onChange({ ...search, q: q === "" ? undefined : q }), searchDebounceMs);
		return () => scheduler.clearTimeout(handle);
	}, [draft, search, onChange, scheduler]);

	useHotkey("f", (event) => {
		if (document.activeElement?.closest('[role="dialog"]') !== null) return;
		event.preventDefault();
		setStage("fields");
		setOpen(true);
	});

	const actorItems = useMemo(
		() =>
			(actors.data ?? []).map((actor) => ({
				id: `${actor.kind}:${actor.name}`,
				label: actor.displayName ?? actor.name,
				hint: actor.kind,
				current: search.author === `${actor.kind}:${actor.name}`,
			})),
		[actors.data, search.author],
	);
	const watcherItems = useMemo(
		() =>
			(runs.data ?? []).map((run) => ({
				id: run.id,
				label: run.name,
				current: search.watcher === run.id,
			})),
		[runs.data, search.watcher],
	);
	const actorNames = useMemo(
		() => new Map((actors.data ?? []).map((actor) => [`${actor.kind}:${actor.name}`, actor.displayName ?? actor.name])),
		[actors.data],
	);
	const watcherNames = useMemo(() => new Map((runs.data ?? []).map((run) => [run.id, run.name])), [runs.data]);

	const close = () => {
		setOpen(false);
		setStage("fields");
	};
	const changeOpen = (next: boolean) => {
		setOpen(next);
		if (!next) setStage("fields");
	};
	const setFilter = (field: PageFilter, raw: string) => {
		const next =
			field === "pin"
				? { ...search, pin: raw === "true" }
				: field === "comment"
					? { ...search, comment: raw as PageSearch["comment"] }
					: { ...search, [field]: raw };
		onChange(next);
		close();
	};
	const valueItems: Record<PageFilter, CommandItem[]> = {
		author: actorItems,
		watcher: watcherItems,
		comment: [
			{ id: "open", label: "Has open comments", current: search.comment === "open" },
			{ id: "none", label: "Has no open comments", current: search.comment === "none" },
		],
		pin: [
			{ id: "true", label: "Pinned", current: search.pin === true },
			{ id: "false", label: "Not pinned", current: search.pin === false },
		],
	};
	const valueLabel = (field: PageFilter) => {
		if (field === "author")
			return actorNames.get(search.author!) ?? search.author!.slice(search.author!.indexOf(":") + 1);
		if (field === "watcher") return watcherNames.get(search.watcher!) ?? search.watcher!;
		if (field === "comment") return search.comment === "open" ? "Has open comments" : "Has no open comments";
		return search.pin ? "Pinned" : "Not pinned";
	};
	const active = (Object.keys(labels) as PageFilter[]).filter((field) => search[field] !== undefined);
	const items = stage === "fields" ? fieldItems : valueItems[stage];

	return (
		<FilterBar
			filters={active.map((field) => (
				<Chip
					key={field}
					icon={icons[field]}
					label={labels[field]}
					value={valueLabel(field)}
					onValueClick={() => {
						setStage(field);
						setOpen(true);
					}}
					onRemove={() => onChange({ ...search, [field]: undefined })}
					removeLabel={`Remove ${labels[field]} filter`}
				/>
			))}
		>
			<Input
				type="search"
				label="Search Pages"
				hideLabel
				placeholder="Search Pages…"
				value={draft}
				onChange={(event) => setDraft(event.target.value)}
				className="w-48 max-md:w-32"
			/>
			<FilterPopover
				trigger={<IconButton label="Filter Pages" icon={<FunnelSimple />} variant="default" />}
				open={open}
				onOpenChange={changeOpen}
				stage={stage}
				label={stage === "fields" ? "Search Page filters" : `Search ${labels[stage]} values`}
				placeholder={stage === "fields" ? "Filter by" : labels[stage]}
				items={items}
				empty={stage === "watcher" ? "No assigned agent." : undefined}
				onSelect={(id) => (stage === "fields" ? setStage(id as PageFilter) : setFilter(stage, id))}
			/>
		</FilterBar>
	);
}
