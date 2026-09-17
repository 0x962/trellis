import { ArrowClockwise } from "@phosphor-icons/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { LoopAction } from "@trellis/api";
import { EmptyState, IconButton, LoopStatus, Skeleton, Tooltip } from "@trellis/ui";
import { useApp } from "../../../lib/appContext";
import { PageTitle } from "../../shell/PageTitle";
import { Topbar } from "../../shell/Topbar";

export function LoopsPage() {
	const { client, orpc, queryClient } = useApp();
	const options = orpc.loops.list.queryOptions({ input: {} });
	const loops = useQuery({ ...options, refetchInterval: 1000 });
	const control = useMutation({
		mutationFn: (input: { id: "deterministic-manager"; action: LoopAction }) => client.loops.control(input),
		onSuccess: (loop) => queryClient.setQueryData(options.queryKey, [loop]),
		onSettled: () => queryClient.invalidateQueries({ queryKey: options.queryKey }),
	});
	return (
		<>
			<Topbar
				actions={
					<Tooltip content="Refresh loops">
						<IconButton
							label="Refresh loops"
							icon={<ArrowClockwise />}
							onClick={() => void loops.refetch()}
							disabled={loops.isFetching}
						/>
					</Tooltip>
				}
			>
				<PageTitle title="Loops" />
			</Topbar>
			<div className="page-card flex-1 overflow-y-auto px-8 py-6 max-md:px-4">
				<div className="mx-auto flex max-w-4xl flex-col gap-6">
					{control.isError && (
						<p role="alert" className="text-sm text-danger">
							{control.error.message}
						</p>
					)}
					{loops.isError && (
						<p role="alert" className="text-sm text-danger">
							Could not refresh loops: {loops.error.message}
						</p>
					)}
					{loops.isPending ? (
						<div role="status" aria-label="Load loops">
							<Skeleton className="h-64 w-full" />
						</div>
					) : loops.data?.length === 0 ? (
						<EmptyState title="No loops available" description="The host has not registered a loop." />
					) : (
						loops.data?.map((loop) => (
							<LoopStatus
								key={loop.id}
								{...loop}
								busy={control.isPending || loops.isError}
								onAction={(action) => control.mutate({ id: loop.id, action })}
							/>
						))
					)}
				</div>
			</div>
		</>
	);
}
