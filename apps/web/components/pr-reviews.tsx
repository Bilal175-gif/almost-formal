"use client";
import { useQuery } from "@tanstack/react-query";
import { Instagram } from "lucide-react";
import { api } from "@/lib/api";

type ReviewVideo = { id: string; url: string; caption: string };
export function PrReviews() {
  const { data = [] } = useQuery({ queryKey: ["pr-reviews"], queryFn: () => api<ReviewVideo[]>("/stories"), staleTime: 300000 });
  return <section className="pr-reviews paper" aria-labelledby="pr-reviews-title">
    <div className="pr-reviews-heading"><span className="eyebrow">FROM @ALMOST.FORMAL</span><h2 id="pr-reviews-title">PR + Reviews</h2><p>Real videos from our Instagram. Press play to watch.</p></div>
    <div className="pr-reviews-track">{data.map((video) => <article key={video.id} className="pr-review-card"><iframe title={video.caption || "Almost Formal Instagram video"} src={`${video.url.replace(/\/$/, "")}/embed/`} loading="lazy" allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen /><a href={video.url} target="_blank" rel="noopener noreferrer"><Instagram size={16} /> Watch on Instagram</a></article>)}</div>
  </section>;
}
