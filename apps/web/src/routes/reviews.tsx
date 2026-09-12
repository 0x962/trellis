import { createFileRoute } from "@tanstack/react-router";
import { ReviewsPage } from "../features/reviews/ReviewsPage/ReviewsPage";
export const Route = createFileRoute("/reviews")({ component: ReviewsPage });
