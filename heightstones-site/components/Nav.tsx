"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import Image from "next/image";

const LINKS = [
  { href: "/#strata", label: "Stones" },
  { href: "/#slab-lab", label: "Slab Lab" },
  { href: "/#collections", label: "Collections" },
  { href: "/#process", label: "Process" },
  { href: "/#offices", label: "Offices" },
];

export default function Nav() {
  const [open, setOpen] = useState(false);
  const [solid, setSolid] = useState(false);

  useEffect(() => {
    const on = () => setSolid(window.scrollY > 80);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("menu-open", open);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [open]);

  return (
    <>
      <header className={`nav ${solid && !open ? "is-solid" : ""}`}>
        <Link href="/" className="nav-brand" aria-label="Height Stones, home" onClick={() => setOpen(false)}>
          <Image src="/height-stones-logo.png" alt="Height Stones" width={573} height={178} priority className="nav-logo" />
        </Link>
        <nav aria-label="Main" className="nav-links">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="roll">
              <span data-text={l.label}>{l.label}</span>
            </Link>
          ))}
        </nav>
        <Link href="/#enquiry" className="nav-cta">
          Request samples
        </Link>
        <button className="nav-burger" aria-expanded={open} aria-controls="menu" onClick={() => setOpen(!open)}>
          <span className="sr-only">{open ? "Close menu" : "Open menu"}</span>
          <i />
          <i />
        </button>
      </header>
      <div id="menu" className={`menu ${open ? "is-open" : ""}`} hidden={!open}>
        <nav aria-label="Mobile">
          {[...LINKS, { href: "/#enquiry", label: "Request samples" }].map((l, i) => (
            <Link key={l.href} href={l.href} onClick={() => setOpen(false)} style={{ transitionDelay: `${i * 40}ms` }}>
              <small>{String(i + 1).padStart(2, "0")}</small>
              {l.label}
            </Link>
          ))}
        </nav>
        <p className="mono">Jaipur · Dubai · Brisbane</p>
      </div>
    </>
  );
}
