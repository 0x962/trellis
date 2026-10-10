import { createFileRoute } from "@tanstack/react-router";
import { RolesPage } from "../features/roles/RolesPage";

export const Route = createFileRoute("/agents/roles")({ component: RolesPage });
