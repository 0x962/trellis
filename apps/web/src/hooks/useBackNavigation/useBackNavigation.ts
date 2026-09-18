import { useRouter } from "@tanstack/react-router";
import { useCallback } from "react";
import { backNavigation } from "../../lib/backNavigation";

export const useBackNavigation = () => {
	const router = useRouter();
	const back = useCallback(() => {
		void backNavigation(router);
	}, [router]);
	return { back };
};
