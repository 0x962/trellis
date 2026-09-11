import { createFileRoute } from "@tanstack/react-router";
import { NeedsYou } from "../../features/needs-you/NeedsYou";

export const Route = createFileRoute("/needs-you")({ component: NeedsYou });
