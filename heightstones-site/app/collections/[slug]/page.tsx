import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import StoneSwatch from "@/components/StoneSwatch";
import Reveal from "@/components/Reveal";
import Gallery from "@/components/Gallery";
import { PHOTOS } from "@/lib/photos";
import { COLLECTIONS, collectionBySlug, stoneBySlug } from "@/lib/data";

type Params = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return COLLECTIONS.map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const c = collectionBySlug((await params).slug);
  return c ? { title: c.name, description: c.body } : {};
}

export default async function CollectionPage({ params }: Params) {
  const c = collectionBySlug((await params).slug);
  if (!c) notFound();
  const stone = stoneBySlug(c.stone)!;
  const others = COLLECTIONS.filter((x) => x.slug !== c.slug);
  const photos = c.photos.flatMap((k) => PHOTOS[k] ?? []);

  return (
    <>
      <Reveal />
      <section className="coll-hero" data-stratum={c.name}>
        <StoneSwatch stone={stone} finish={c.finish} className="coll-hero-rock" seed={21} />
        <div className="coll-hero-text">
          <Link href="/#collections" className="mono back">← All collections</Link>
          <p className="overline mono">Collection {c.no}</p>
          <h1 className="display">{c.name}</h1>
          <p className="core-line">{c.line}</p>
          <p className="sec-lede">{c.body}</p>
        </div>
      </section>

      <section className="items-sec" data-stratum="Products">
        <ol className="items">
          {c.items.map((it, i) => (
            <li key={it.name} data-reveal style={{ ["--d" as string]: `${(i % 3) * 70}ms` }}>
              <span className="mono">{String(i + 1).padStart(2, "0")}</span>
              <h2>{it.name}</h2>
              <p>{it.note}</p>
            </li>
          ))}
        </ol>
        <p className="items-cta" data-reveal>
          Every piece is made to order — sizes, finishes and profiles customised to your project.{" "}
          <Link href="/#enquiry" className="link-line">Send us your layout →</Link>
        </p>
      </section>

      {photos.length > 0 && (
        <section className="gallery-sec sand" data-stratum="Catalogue">
          <header className="sec-head">
            <p className="overline mono" data-reveal>Catalogue · {photos.length} pieces</p>
            <h2 className="display" data-reveal>
              From the <em>catalogue.</em>
            </h2>
          </header>
          <Gallery photos={photos} />
        </section>
      )}

      <section className="coll-sec ochre" data-stratum="More collections">
        <ul className="colls">
          {others.map((o) => (
            <li key={o.slug}>
              <Link href={`/collections/${o.slug}`} className="coll">
                <span className="coll-no">{o.no}</span>
                <span className="coll-main">
                  <span className="coll-name">{o.name}</span>
                  <span className="coll-items">{o.line}</span>
                </span>
                <StoneSwatch stone={stoneBySlug(o.stone)!} finish={o.finish} className="coll-peek" seed={21} />
                <span className="coll-arrow">→</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
