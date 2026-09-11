import { createFileRoute } from "@tanstack/react-router";
import { PersonasPage } from "../features/personas/PersonasPage";

export const Route = createFileRoute("/ai/personas")({ component: PersonasPage });
