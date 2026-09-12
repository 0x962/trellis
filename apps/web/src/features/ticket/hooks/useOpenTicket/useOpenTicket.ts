import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";

export const useOpenTicket = () => {
	const navigate = useNavigate();
	return useCallback(
		(identifier: string) => void navigate({ to: "/t/$identifier", params: { identifier } }),
		[navigate],
	);
};
