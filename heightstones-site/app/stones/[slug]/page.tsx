import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import LiveStone from "@/components/LiveStone";
import StoneSwatch from "@/components/StoneSwatch";
import SlabLab from "@/components/SlabLab";
import Reveal from "@/components/Reveal";
import Gallery from "@/components/Gallery";
import { PHOTOS } from "@/lib/photos";
import { FINISHES, STONES, stoneBySlug } from "@/lib/data";

type Params = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return STONES.map((s) => ({ slug: s.slug }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const s = stoneBySlug((await params).slug);
  return s ? { title: s.plural, description: s.body } : {};
}

export default async function StonePage({ params }: Params) {
  const stone = stoneBySlug((await params).slug);
  if (!stone) notFound();
  const i = STONES.indexOf(stone);
  const next = STONES[(i + 1) % STONES.length];
  const photos = PHOTOS[stone.slug] ?? [];

  return (
    <>
      <Reveal />
      <section className="core-hero" data-stratum={stone.name}>
        <LiveStone stone={stone} finish={stone.finishes[0]} seed={4} className="core-stone" label={`${stone.name} surface`}>
          <div className="core-label">
            <Link href="/#strata" className="mono back">← All stones</Link>
            <p className="tag-no mono">Core No. {stone.no} / 08</p>
            <h1 className="display">{stone.name}</h1>
            <p className="core-line">{stone.line}</p>
          </div>
        </LiveStone>
      </section>

      <section className="core-body" data-stratum={`${stone.name} · core`}>
        <div className="core-intro">
          <p className="overline mono" data-reveal>{stone.plural}</p>
          <p className="core-lede" data-reveal>{stone.body}</p>
        </div>
        <dl className="core-facts">
          <div data-reveal>
            <dt className="mono">Popular varieties</dt>
            <dd>
              <ul>{stone.varieties.map((v) => <li key={v}>{v}</li>)}</ul>
            </dd>
          </div>
          <div data-reveal>
            <dt className="mono">Where it goes</dt>
            <dd>
              <ul>{stone.uses.map((u) => <li key={u}>{u}</li>)}</ul>
            </dd>
          </div>
          <div data-reveal>
            <dt className="mono">Formats</dt>
            <dd>
              <ul>
                <li>Gangsaw slabs</li>
                <li>Calibrated tiles</li>
                <li>Custom sizes & thickness</li>
                <li>Cut-to-size from drawings</li>
              </ul>
            </dd>
          </div>
        </dl>
      </section>

      {photos.length > 0 && (
        <section className="gallery-sec" data-stratum="In stock">
          <header className="sec-head sec-head-split">
            <div>
              <p className="overline mono" data-reveal>Catalogue · {photos.length} varieties</p>
              <h2 className="display" data-reveal>
                The real <em>{stone.name.toLowerCase()}.</em>
              </h2>
            </div>
            <p className="sec-lede" data-reveal>
              Natural stone varies from block to block, so we&rsquo;ll send a sample from your actual lot before
              anything is cut. Tap a variety to ask for its price.
            </p>
          </header>
          <Gallery photos={photos} strip={stone.name} />
        </section>
      )}

      <section className="finishes-sec sand" data-stratum="Finishes">
        <header className="sec-head">
          <p className="overline mono" data-reveal>{stone.finishes.length} finishes</p>
          <h2 className="display" data-reveal>
            One stone, <em>{stone.finishes.length} faces.</em>
          </h2>
        </header>
        <ul className="finishes">
          {stone.finishes.map((k, n) => (
            <li key={k} data-reveal style={{ ["--d" as string]: `${n * 70}ms` }}>
              <StoneSwatch stone={stone} finish={k} seed={4} className="finish-swatch" />
              <h3>{FINISHES[k].name}</h3>
              <p>{FINISHES[k].note}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="lab-sec" id="slab-lab" data-stratum="Slab Lab">
        <header className="sec-head">
          <p className="overline mono" data-reveal>Slab Lab</p>
          <h2 className="display" data-reveal>
            Try it <em>under the lamp.</em>
          </h2>
        </header>
        <SlabLab initialStone={stone.slug} />
        <p className="lab-cta">
          <Link href="/#enquiry" className="link-line">Ask for {stone.name.toLowerCase()} prices &amp; samples →</Link>
        </p>
      </section>

      <section className="next-core dark" data-stratum="Next bed">
        <Link href={`/stones/${next.slug}`} className="next-link">
          <StoneSwatch stone={next} className="next-rock" seed={Number(next.no) * 3} />
          <span className="next-label">
            <span className="mono">Next bed · No. {next.no}</span>
            <span className="display">{next.name} →</span>
          </span>
        </Link>
      </section>
    </>
  );
}
