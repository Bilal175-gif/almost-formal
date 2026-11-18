"use client";
export default function Error({ reset }: { reset: () => void }) {
  return (
    <section className="paper empty-state">
      <h1>A little snag in the story.</h1>
      <p>We couldn’t load this page. Please try again.</p>
      <button className="button" onClick={reset}>
        Try again
      </button>
    </section>
  );
}
