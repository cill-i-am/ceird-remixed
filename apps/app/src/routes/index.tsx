import { createFileRoute } from "@tanstack/react-router";
import { apiHealthUrl } from "../public-config";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  return (
    <main className="page">
      <section className="intro" aria-labelledby="page-title">
        <p className="eyebrow">Cloudflare Workers + Alchemy</p>
        <h1 id="page-title">Ceird is running on TanStack Start.</h1>
        <p className="lede">
          A minimal rich web app shell, wired into the same trunk and PR-stage
          deployment graph as the Effect HTTP API.
        </p>
        <div className="actions">
          <a className="button" href={apiHealthUrl}>
            API health
          </a>
        </div>
      </section>
    </main>
  );
}
