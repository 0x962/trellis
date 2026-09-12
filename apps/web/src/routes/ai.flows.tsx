import { createFileRoute } from "@tanstack/react-router";
import { FlowsPage } from "../features/flows/FlowsPage";

export const Route = createFileRoute("/ai/flows")({ component: FlowsPage });
