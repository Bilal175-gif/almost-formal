import Link from "next/link";
import {
  ArrowRight,
  Heart,
  BadgeCheck,
  Shirt,
  Instagram,
} from "lucide-react";
import { Star, Smile, ArrowDoodle } from "./doodles";
import { Featured, MobileDiscovery } from "./products";
import { SocialFollow } from "./social-follow";
export function Hero() {
  return (
    <section className="hero" aria-labelledby="hero-title">
      <div className="hero-art" />
      <div className="hero-content">
        <Star className="hero-star-a" />
        <h1 id="hero-title" className="cutout-title">
          <span className="word-bold">BOLD</span>
          <span className="word-ties">TIES.</span>
          <span className="word-big">BIG</span>
          <span className="word-moments">MOMENTS.</span>
        </h1>
        <div className="hero-note handwriting">
          Sharp details
          <br />
          for every
          <br />
          moment.
        </div>
        <Link className="button hero-cta" href="/shop">
          Shop the drop <ArrowRight size={22} />
        </Link>
        <Smile className="hero-smile" />
        <Star className="hero-star-b" />
        <span className="hero-lines">〃</span>
        <span className="hero-scribble">⌁</span>
      </div>
      <div className="hero-label paper-note">
        <span>
          ONE
          <br />
          OF
          <br />
          ONE
        </span>
        <ArrowDoodle />
      </div>
      <div className="hero-side-note handwriting">
        Not
        <br />
        perfect.
        <br />
        Just.
        <br />
        Right.
      </div>
      <Star className="hero-star-c" />
      <div className="hero-tape" />
    </section>
  );
}
export function Benefits() {
  return (
    <div className="benefits paper">
      <div>
        <BadgeCheck />
        <span>
          <strong>ONE-OF-ONE PIECES</strong>
          <small>No mass production</small>
        </span>
      </div>
      <div>
        <Shirt />
        <span>
          <strong>CURATED WITH CARE</strong>
          <small>Details worth dressing for</small>
        </span>
      </div>
      <div>
        <Heart />
        <span>
          <strong>HONEST CONDITION</strong>
          <small>What you see is what you get</small>
        </span>
      </div>
    </div>
  );
}
export function StoryBlock() {
  return (
    <section className="story-block">
      <div className="story-collage">
        <div className="photo-frame">
          <img
            src="/images/story.webp"
            alt="Editorial portrait with a red paisley tie"
          />
          <span className="handwriting">a look worth remembering.</span>
        </div>
        <div className="paper-note story-note handwriting">
          Just
          <br />
          ties.
          <br />
          But
          <br />
          different.
        </div>
        <Smile />
        <Star />
      </div>
      <div className="story-copy">
        <span className="eyebrow">MAKE THE FIRST IMPRESSION YOURS.</span>
        <h2>Our story</h2>
        <p>
          Almost Formal is about the finishing touch. We choose ties with
          personality, polish and just enough unexpected detail to make a
          look your own.
        </p>
        <Link className="button mustard" href="/our-story">
          Read our story <ArrowRight size={19} />
        </Link>
        <div className="paper-note story-bottom handwriting">
          GOOD TIES.
          <br />
          GREAT
          <br />
          STORIES.
        </div>
      </div>
      <div className="style-poster">
        <Star />
        <span>
          DRESS
          <br />
          YOUR
          <br />
          WAY.
        </span>
        <Shirt className="poster-icon" strokeWidth={1.2} />
        <Star />
      </div>
    </section>
  );
}
export function SocialGallery() {
  return (
    <section className="social-gallery paper">
      <div className="social-heading">
        <Instagram size={25} />
        <SocialFollow />
        <ArrowDoodle />
      </div>
      <div>
        {[4, 6, 2, 3, 7].map((n, i) => (
          <Link
            key={n}
            href="/shop"
            aria-label={`Explore tie ${i + 1}`}
          >
            <img
              src={`/images/tie-${n}.webp`}
              alt={
                [
                  "Classic stripes",
                  "Statement bow tie",
                  "Paisley details",
                  "Heritage pattern",
                  "Navy geometric tie",
                ][i]
              }
              loading="lazy"
            />
          </Link>
        ))}
      </div>
    </section>
  );
}
export default function HomePage() {
  return (
    <>
      <MobileDiscovery />
      <Featured />
      <StoryBlock />
      <div className="bottom-collage">
        <div className="not-overdressed sticky-note">
          <span>
            NOT
            <br />
            OVERDRESSED.
            <br />
            JUST RIGHT.
          </span>
          <Smile />
        </div>
        <SocialGallery />
      </div>
    </>
  );
}
