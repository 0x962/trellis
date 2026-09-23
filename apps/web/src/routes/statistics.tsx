import { createFileRoute } from "@tanstack/react-router";
import { StatisticsPage } from "../features/statistics/StatisticsPage";

export const Route = createFileRoute("/statistics")({
	component: StatisticsPage,
});
