import Link from "next/link";
import LiveStone from "@/components/LiveStone";
import StoneSwatch from "@/components/StoneSwatch";
import SlabLab from "@/components/SlabLab";
import Enquiry from "@/components/Enquiry";
import Clock from "@/components/Clock";
import Reveal from "@/components/Reveal";
import { CHECKS, COLLECTIONS, FACTS, MARKETS, OFFICES, SERVICES, STONES, stoneBySlug } from "@/lib/data";

const Arrow = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M5 12h13m-5-6 6 6-6 6" />
  </svg>
);

export default function Home() {
  const marble = stoneBySlug("indian-marble")!;

  return (
    <>
      <Reveal />

      {/* ── Surface ─────────────────────────────── */}
      <section className="hero" id="top" data-stratum="Surface">
        <LiveStone stone={marble} finish="polished" seed={2} scale={1.9} className="hero-stone" label="Polished Indian marble slab, lit by a moving lamp">
          <div className="hero-veil" />
          <div className="hero-inner">
            <p className="overline mono hero-in" style={{ ["--d" as string]: "0ms" }}>
              Manufacturer &amp; exporter of natural stone
            </p>
            <h1 className="hero-title">
              <span className="line"><span className="hero-in" style={{ ["--d" as string]: "80ms" }}>Cut from the earth.</span></span>
              <span className="line"><span className="hero-in" style={{ ["--d" as string]: "180ms" }}><em>Exact</em> to the</span></span>
              <span className="line"><span className="hero-in" style={{ ["--d" as string]: "280ms" }}>millimetre.</span></span>
            </h1>
            <div className="hero-foot hero-in" style={{ ["--d" as string]: "420ms" }}>
              <p>
                Sandstone, marble, granite, limestone, slate, quartzite, travertine and onyx — quarried in India, calibrated on CNC lines and
                crated for projects on five continents.
              </p>
              <div className="hero-ctas">
                <Link href="#strata" className="btn btn-ink">
                  <span>Explore the stones</span>
                  <Arrow />
                </Link>
                <Link href="#slab-lab" className="link-line">Open the Slab Lab</Link>
              </div>
            </div>
          </div>
          <div className="hero-tag mono" aria-hidden="true">
            <span>Slab no. 0001</span>
            <span>White marble · Polished · 20 mm</span>
            <span>26.91° N · 75.79° E</span>
          </div>
          <p className="hero-hint mono" aria-hidden="true">
            <span className="lamp" /> Your cursor is the lamp
          </p>
        </LiveStone>
      </section>

      {/* ── Facts ─────────────────────────────── */}
      <section className="facts" aria-label="Height Stones in numbers" data-stratum="Topsoil">
        {FACTS.map((f, i) => (
          <div key={f.label} className="fact" data-reveal style={{ ["--d" as string]: `${i * 90}ms` }}>
            <p className="fact-num">
              {f.value}
              <small>{f.unit}</small>
            </p>
            <p className="fact-label">{f.label}</p>
          </div>
        ))}
      </section>

      {/* ── Strata ─────────────────────────────── */}
      <section className="strata-sec dark" id="strata" data-stratum="The strata">
        <header className="sec-head">
          <p className="overline mono" data-reveal>The strata · 08 beds</p>
          <h2 className="display" data-reveal>
            Eight stones.
            <br />
            <em>One quarry line.</em>
          </h2>
          <p className="sec-lede" data-reveal>
            Every bed below is a stone we cut, calibrate and finish in our own five units — in custom sizes, to the exact thickness your
            drawings ask for. Hover a bed to open it; click to read its core.
          </p>
        </header>

        <ol className="strata">
          {STONES.map((s) => (
            <li key={s.slug} style={{ ["--bed" as string]: s.bed }}>
              <Link href={`/stones/${s.slug}`} className="stratum">
                <StoneSwatch stone={s} className="stratum-rock" seed={Number(s.no) * 3} />
                <span className="tag">
                  <span className="tag-no mono">No. {s.no}</span>
                  <span className="tag-name">{s.name}</span>
                  <span className="tag-line">{s.line}</span>
                </span>
                <span className="stratum-meta mono">
                  {s.varieties.slice(0, 3).join(" · ")}
                  <span className="stratum-go">
                    Read the core <Arrow />
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ol>
      </section>

      {/* ── Slab Lab ─────────────────────────────── */}
      <section className="lab-sec" id="slab-lab" data-stratum="Slab Lab">
        <header className="sec-head sec-head-split">
          <div>
            <p className="overline mono" data-reveal>Slab Lab · interactive</p>
            <h2 className="display" data-reveal>
              Put a lamp <em>to it.</em>
            </h2>
          </div>
          <p className="sec-lede" data-reveal>
            Our graders judge a finish the way stone is lived with: under raking light. Choose a stone, a finish and a thickness, then sweep
            the lamp across the slab. When it looks right, we&rsquo;ll cut you the real thing.
          </p>
        </header>
        <SlabLab />
      </section>

      {/* ── Collections ─────────────────────────────── */}
      <section className="coll-sec ochre" id="collections" data-stratum="Collections">
        <header className="sec-head">
          <p className="overline mono" data-reveal>Beyond the slab</p>
          <h2 className="display" data-reveal>
            Paving, gardens, walls <em>&amp; rooms.</em>
          </h2>
        </header>
        <ul className="colls">
          {COLLECTIONS.map((c) => {
            const s = stoneBySlug(c.stone)!;
            return (
              <li key={c.slug} data-reveal>
                <Link href={`/collections/${c.slug}`} className="coll">
                  <span className="coll-no">{c.no}</span>
                  <span className="coll-main">
                    <span className="coll-name">{c.name}</span>
                    <span className="coll-items">{c.items.map((i) => i.name).join(" · ")}</span>
                  </span>
                  <StoneSwatch stone={s} finish={c.finish} className="coll-peek" seed={21} />
                  <span className="coll-arrow"><Arrow /></span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      {/* ── Process ─────────────────────────────── */}
      <section className="process-sec dark" id="process" data-stratum="Seven checks">
        <header className="sec-head sec-head-split">
          <div>
            <p className="overline mono" data-reveal>Quality · 7 checks</p>
            <h2 className="display" data-reveal>
              Seven checks between the quarry face <em>and your site.</em>
            </h2>
          </div>
          <p className="sec-lede" data-reveal>
            High-production machinery and automated CNC lines do the cutting. People do the checking — seven times, so what arrives is
            what you approved, on the date we promised.
          </p>
        </header>
        <ol className="steps">
          {CHECKS.map((c, i) => (
            <li key={c.name} className="step" data-reveal style={{ ["--i" as string]: i, ["--d" as string]: `${i * 70}ms` }}>
              <span className="step-no">{String(i + 1).padStart(2, "0")}</span>
              <h3>{c.name}</h3>
              <p>{c.note}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* ── Services ─────────────────────────────── */}
      <section className="services-sec" id="services" data-stratum="Services">
        <blockquote className="manifesto" data-reveal>
          <p>
            We don&rsquo;t sell stone by the tonne. We sell the floor you&rsquo;ll walk on <em>for the next fifty years.</em>
          </p>
        </blockquote>
        <ul className="services">
          {SERVICES.map((s, i) => (
            <li key={s.slug} data-reveal style={{ ["--d" as string]: `${i * 90}ms` }}>
              <span className="mono">S/{String(i + 1).padStart(2, "0")}</span>
              <h3>{s.name}</h3>
              <p>{s.body}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* ── Offices ─────────────────────────────── */}
      <section className="offices-sec sand" id="offices" data-stratum="Offices">
        <header className="sec-head">
          <p className="overline mono" data-reveal>Three desks · one quarry line</p>
          <h2 className="display" data-reveal>
            Jaipur. Dubai. <em>Brisbane.</em>
          </h2>
        </header>
        <div className="offices">
          {OFFICES.map((o) => (
            <article key={o.city} className="office" data-reveal>
              <header>
                <h3>{o.city}</h3>
                <Clock tz={o.tz} />
              </header>
              <p className="mono office-role">{o.role} · {o.coords}</p>
              <address>
                {o.address.map((l) => (
                  <span key={l}>{l}</span>
                ))}
              </address>
              <p className="office-links">
                <a href={`tel:${o.tel}`} className="wipe">{o.phone}</a>
                <a href={`mailto:${o.email}`} className="wipe">{o.email}</a>
              </p>
            </article>
          ))}
        </div>
        <div className="markets" aria-label="Markets we ship to">
          <div className="markets-track">
            {[0, 1].map((k) => (
              <span key={k} aria-hidden={k === 1}>
                {MARKETS.map((m) => (
                  <span key={m}>
                    {m}
                    <i>◆</i>
                  </span>
                ))}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── Enquiry ─────────────────────────────── */}
      <section className="enquiry-sec dark" id="enquiry" data-stratum="Enquiry">
        <header className="sec-head">
          <p className="overline mono" data-reveal>Prices &amp; samples</p>
          <h2 className="display" data-reveal>
            Let&rsquo;s make something <em>great together.</em>
          </h2>
          <p className="sec-lede" data-reveal>
            Tell us the stone, the finish and where it&rsquo;s going. You&rsquo;ll get competitive prices — and a sample in your hand before
            you commit to a container.
          </p>
        </header>
        <Enquiry />
      </section>
    </>
  );
}
