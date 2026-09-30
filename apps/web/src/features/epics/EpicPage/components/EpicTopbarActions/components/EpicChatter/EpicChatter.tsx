import { ChatsCircle } from "@phosphor-icons/react";
import { useInfiniteQuery, useMutation, useQuery } from "@tanstack/react-query";
import { ChatterPanel, Sheet, Tooltip } from "@trellis/ui";
import { useMemo, useRef, useState } from "react";
import { useApp } from "../../../../../../../lib/appContext";
import { TopbarActionButton } from "../../../../../../shell/Topbar";

export function EpicChatter({ epic, readOnly }: { epic: { ref: string; name: string } | null; readOnly: boolean }) {
	const [open, setOpen] = useState(false);
	const trigger = useRef<HTMLButtonElement>(null);
	return (
		<>
			<Tooltip content="Chatter">
				<TopbarActionButton
					data-bar-slot="chatter"
					ref={trigger}
					label="Chatter"
					icon={<ChatsCircle />}
					disabled={epic === null}
					onClick={() => setOpen(true)}
				/>
			</Tooltip>
			{open && epic && (
				<Sheet open title="Chatter" titleClassName="text-md font-medium" finalFocus={trigger} onOpenChange={setOpen}>
					<ChatterContent epic={epic} readOnly={readOnly} />
				</Sheet>
			)}
		</>
	);
}

function ChatterContent({ epic, readOnly }: { epic: { ref: string; name: string }; readOnly: boolean }) {
	const { client, orpc, queryClient } = useApp();
	const settingsOptions = orpc.epicChatter.get.queryOptions({ input: { epic: epic.ref } });
	const settings = useQuery(settingsOptions);
	const history = useInfiniteQuery(
		orpc.epicChatter.list.infiniteOptions({
			input: (before: string | undefined) => ({ epic: epic.ref, before }),
			initialPageParam: undefined as string | undefined,
			getNextPageParam: (page) => page.nextCursor ?? undefined,
		}),
	);
	const save = useMutation({
		mutationFn: (enabled: boolean) => client.epicChatter.set({ epic: epic.ref, enabled }),
		onSuccess: (result) => queryClient.setQueryData(settingsOptions.queryKey, result),
		onError: () => void queryClient.invalidateQueries({ queryKey: settingsOptions.queryKey }),
	});
	const messages = useMemo(
		() =>
			[...new Map(history.data?.pages.flatMap((page) => page.items).map((item) => [item.id, item])).values()].sort(
				(a, b) => a.id.localeCompare(b.id),
			),
		[history.data],
	);
	return (
		<ChatterPanel
			epicName={epic.name}
			enabled={settings.data?.enabled}
			onEnabledChange={(enabled) => save.mutate(enabled)}
			saving={save.isPending}
			readOnly={readOnly}
			messages={messages}
			loading={history.isPending}
			error={save.error?.message ?? settings.error?.message ?? history.error?.message ?? null}
			onRetry={() => {
				save.reset();
				void settings.refetch();
				void history.refetch();
			}}
			hasEarlier={history.hasNextPage}
			loadingEarlier={history.isFetchingNextPage}
			onLoadEarlier={() => void history.fetchNextPage()}
		/>
	);
}
