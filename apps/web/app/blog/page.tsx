import Link from "next/link";
import type { Metadata } from "next";
import { serverApi } from "@/lib/server-api";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "The Almost Formal Journal", description: "Necktie style, care and stories from Almost Formal.", alternates: { canonical: "/blog" } };
type Post = { id: string; slug: string; title: string; summary: string; coverUrl: string; createdAt: string };
export default async function Blog() {
  let posts: Post[] = [];
  try { const response = await serverApi("/blog"); if (response.ok) posts = await response.json(); } catch {}
  return <section className="content-page paper"><div className="editorial"><span className="eyebrow">NOTES FROM ALMOST FORMAL</span><h1>The Journal</h1><p>Stories, style ideas and care notes for ties with character.</p></div><div className="journal-grid">{posts.map((post) => <article key={post.id}>{post.coverUrl && <img src={post.coverUrl} alt="" loading="lazy" />}<time dateTime={post.createdAt}>{new Date(post.createdAt).toLocaleDateString("en-PK")}</time><h2><Link href={`/blog/${post.slug}`}>{post.title}</Link></h2><p>{post.summary}</p></article>)}</div>{!posts.length && <p className="stories-empty">Fresh stories are on their way.</p>}</section>;
}
