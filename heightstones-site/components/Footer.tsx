import Link from "next/link";
import { COLLECTIONS, OFFICES, STONES } from "@/lib/data";
import Carved from "./Carved";

export default function Footer() {
  return (
    <footer className="footer" data-stratum="Bedrock">
      <div className="footer-cols">
        <div>
          <h2 className="mono">Natural stone</h2>
          <ul>
            {STONES.map((s) => (
              <li key={s.slug}>
                <Link href={`/stones/${s.slug}`} className="wipe">{s.plural}</Link>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h2 className="mono">Collections</h2>
          <ul>
            {COLLECTIONS.map((c) => (
              <li key={c.slug}>
                <Link href={`/collections/${c.slug}`} className="wipe">{c.name}</Link>
              </li>
            ))}
          </ul>
          <h2 className="mono">Company</h2>
          <ul>
            <li><Link href="/#services" className="wipe">Services</Link></li>
            <li><Link href="/#process" className="wipe">Seven checks</Link></li>
            <li><Link href="/#enquiry" className="wipe">Sampling & enquiries</Link></li>
          </ul>
        </div>
        <div>
          <h2 className="mono">Talk to a desk</h2>
          <ul>
            {OFFICES.map((o) => (
              <li key={o.city}>
                <a href={`tel:${o.tel}`} className="wipe">{o.city} · {o.phone}</a>
              </li>
            ))}
            <li><a href={`mailto:${OFFICES[0].email}`} className="wipe">{OFFICES[0].email}</a></li>
          </ul>
        </div>
      </div>
      <p className="footer-mark" aria-label="Height Stones">
        <Carved text="Height Stones" />
      </p>
      <div className="footer-base mono">
        <span>© {new Date().getFullYear()} Height Stones. All rights reserved.</span>
        <span>Quarried in India · Shipped worldwide</span>
        <a href="#top" className="wipe">Back to the surface ↑</a>
      </div>
    </footer>
  );
}
