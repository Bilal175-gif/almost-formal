import Link from "next/link";
export default function NotFound() {
  return (
    <section className="paper empty-state">
      <h1>This page has wandered off.</h1>
      <p>There are still good finds waiting for you.</p>
      <Link className="button" href="/shop">
        Back to the shop
      </Link>
    </section>
  );
}
