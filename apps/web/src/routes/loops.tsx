import { createFileRoute } from "@tanstack/react-router";
import { LoopsPage } from "../features/loops/LoopsPage";

export const Route = createFileRoute("/loops")({ component: LoopsPage });
