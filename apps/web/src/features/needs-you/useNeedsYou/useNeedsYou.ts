import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "@trellis/ui";
import { useEffect } from "react";
import { useActor } from "../../../lib/actor";
import { useApp } from "../../../lib/appContext";

export const useNeedsYouSummary = () => {
	const { orpc, queryClient } = useApp();
	const actor = useActor();
	const options = orpc.needsYou.summary.queryOptions({ input: {}, staleTime: 0 });
	const result = useQuery({ ...options, queryKey: [...options.queryKey, actor?.name] });
	const wake = result.data?.nextWakeAt;
	useEffect(() => {
		let timer: ReturnType<typeof setTimeout>;
		const refresh = () => {
			void queryClient.invalidateQueries({ queryKey: orpc.needsYou.key() });
		};
		const schedule = () => {
			if (!wake) return;
			const delay = new Date(wake).getTime() - Date.now();
			if (delay <= 0) {
				refresh();
				return;
			}
			timer = setTimeout(schedule, Math.min(delay, 86400000));
		};
		schedule();
		const visible = () => {
			if (document.visibilityState === "visible") refresh();
		};
		window.addEventListener("focus", refresh);
		document.addEventListener("visibilitychange", visible);
		return () => {
			clearTimeout(timer);
			window.removeEventListener("focus", refresh);
			document.removeEventListener("visibilitychange", visible);
		};
	}, [wake, orpc, queryClient]);
	return result;
};

export const useNeedsYouUpdate = () => {
	const { orpc, queryClient } = useApp();
	return useMutation(
		orpc.needsYou.update.mutationOptions({
			onSuccess: () => queryClient.invalidateQueries({ queryKey: orpc.needsYou.key() }),
			onError: (error) => toast.error(error.message),
		}),
	);
};
