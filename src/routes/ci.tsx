import { createFileRoute } from "@tanstack/react-router";
import { Home, articlesQO } from "./index";

export const Route = createFileRoute("/ci")({
  head: () => ({
    meta: [
      { title: "The AI Frontier Brief — CI" },
      {
        name: "description",
        content:
          "The AI Frontier Brief in corporate identity colors — same brief, themed with #4564DA, #D6396B, #7048C1, #00848C.",
      },
    ],
  }),
  component: CiHome,
});

function CiHome() {
  return (
    <div className="theme-ci">
      <Home />
    </div>
  );
}
