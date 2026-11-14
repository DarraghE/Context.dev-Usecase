import Link from "next/link";
import { config } from "@/config";
import { PublicHeader } from "@/components/AppShell";
import { DemoLauncher } from "@/components/DemoLauncher";
import { loadViewer } from "@/lib/viewer";
import { homeFor } from "@/privacy/guards";

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: { searchParams: Promise<{ signin?: string }> }) {
  const viewer = await loadViewer();
  const { signin } = await searchParams;
  return (
    <>
      <PublicHeader />
      <main id="main">
        <div className="container">
          {signin === "required" && !viewer ? (
            <div className="alert alert-info" role="status">
              Please open the personal link your caterer sent you to sign in.
            </div>
          ) : null}
          <section className="hero">
            <div className="eyebrow">A bonus for your wedding catering package</div>
            <h1>The meals that made your story, on your wedding menu.</h1>
            <p className="lede">
              Wedding Food Memory reads the photos and posts you choose to share, finds the meals that mattered — the first date, the proposal, the trip you still talk about — and
              hands your chef a timeline of real dishes from real restaurants to design your menu around.
            </p>
            <div className="row" style={{ marginTop: 20 }}>
              {viewer ? (
                <Link className="btn btn-primary" href={homeFor(viewer.session.role)}>
                  Continue as {viewer.person.displayName}
                </Link>
              ) : config.demoMode ? (
                <DemoLauncher />
              ) : (
                <span className="muted">Open the personal link from your caterer to begin.</span>
              )}
              <Link className="btn btn-secondary" href="/privacy">
                How we protect your data
              </Link>
            </div>
          </section>

          <section id="how" className="stack-lg" aria-labelledby="how-h">
            <h2 id="how-h">How it works</h2>
            <div className="steps">
              <div className="card">
                <h3>You share, on your terms</h3>
                <p className="muted">Each partner consents separately and uploads their own Instagram, Facebook or Google Photos export. We never log in to your accounts.</p>
              </div>
              <div className="card">
                <h3>We find the meals that mattered</h3>
                <p className="muted">
                  Claude spots food in your photos and life events in your captions. <strong>Context.dev</strong> reads the public website of each restaurant you visited, so a geotag
                  becomes the actual dish on its menu.
                </p>
              </div>
              <div className="card">
                <h3>You approve every memory</h3>
                <p className="muted">Nothing reaches the chef until you approve it. Sensitive moments start hidden. Faces are blurred in anything the chef sees.</p>
              </div>
              <div className="card">
                <h3>Your chef drafts the menu</h3>
                <p className="muted">A ranked timeline and a five-course draft that cites your memories, respects every allergy and diet, and is ready to refine in one sitting.</p>
              </div>
            </div>
          </section>

          <section className="grid-2" style={{ marginTop: 40 }} aria-label="Privacy promises">
            <div className="card soft stack">
              <h2>Private by design</h2>
              {[
                "Your export files are deleted as soon as processing finishes — never kept longer than 24 hours.",
                "Full photos are never stored. Only a crop of the food is kept, and only if food was found.",
                "The chef sees approved memories only, with faces blurred.",
                "Everything is deleted automatically 30 days after the wedding.",
              ].map((t) => (
                <div className="promise" key={t}>
                  <span className="dot" aria-hidden="true" />
                  <span>{t}</span>
                </div>
              ))}
            </div>
            <div className="card soft stack">
              <h2>For caterers</h2>
              <p>
                Offer Wedding Food Memory as a premium add-on. You create the booking, the couple and chef get their own links, and you only ever see progress counts — never anyone&apos;s
                photos.
              </p>
              <p className="muted small">You are the data controller; this service acts as your processor and runs on EU hosting.</p>
            </div>
          </section>
        </div>
      </main>
      <footer className="footer">
        <div className="container row-between">
          <span>Wedding Food Memory · Junction 2026 prototype · synthetic demo data</span>
          <span>{config.demoReplay ? "Replay mode: recorded Claude & Context.dev responses" : "Live mode"}</span>
        </div>
      </footer>
    </>
  );
}
