import type { Metadata } from "next";
import { serverApi } from "@/lib/server-api";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Our Stories | Almost Formal", description: "Watch real Almost Formal Instagram Reels and see how one-of-one ties are worn.", alternates: { canonical: "/stories" } };
type Story = { id: string; url: string; caption: string };
export default async function Stories() {
  let stories: Story[] = [];
  try { const response = await serverApi("/stories"); if (response.ok) stories = await response.json(); } catch {}
  return <section className="content-page paper stories-page"><div className="editorial"><span className="eyebrow">FROM @ALMOST.FORMAL</span><h1>Our Stories</h1><p>Real moments from our Instagram. Tap a Reel to play it right here.</p></div>
    {stories.length ? <div className="stories-grid">{stories.map((story) => <article key={story.id}><iframe title={story.caption || "Almost Formal Instagram Reel"} src={`${story.url.replace(/\/$/, "")}/embed/`} loading="lazy" allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen /><p>{story.caption}</p><a href={story.url} target="_blank" rel="noopener noreferrer">View on Instagram</a></article>)}</div> : <p className="stories-empty">Our Reels will appear here as soon as they are added. <a href="https://www.instagram.com/almost.formal/" target="_blank" rel="noopener noreferrer">Visit @almost.formal on Instagram</a>.</p>}
  </section>;
}
