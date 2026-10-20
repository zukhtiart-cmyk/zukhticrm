import Image from "next/image";
import Link from "next/link";
import type { Photo } from "@/lib/photos";

type Props = {
  photos: Photo[];
  // Word to drop from captions, e.g. "Sandstone" on the sandstone page.
  strip?: string;
};

// The real stone, from the catalogue. Each tile opens the enquiry form with
// that variety already filled in.
export default function Gallery({ photos, strip }: Props) {
  return (
    <ul className="gallery">
      {photos.map((p, i) => {
        const label = strip ? p.name.replace(new RegExp(`\\s*${strip}\\b`, "i"), "").trim() || p.name : p.name;
        const ask = p.code ? `${p.name} (${p.code})` : p.name;
        return (
          <li key={p.src} className={i === 0 && p.w >= 700 ? "is-lead" : undefined} data-reveal style={{ ["--d" as string]: `${(i % 4) * 60}ms` }}>
            <Link href={`/?sample=${encodeURIComponent(ask)}#enquiry`} className="gal">
              <span className="gal-img">
                <Image
                  src={p.src}
                  alt={p.name}
                  width={p.w}
                  height={p.h}
                  sizes={i === 0 && p.w >= 700 ? "(min-width: 900px) 50vw, 100vw" : "(min-width: 900px) 25vw, (min-width: 600px) 50vw, 100vw"}
                />
              </span>
              <span className="gal-cap">
                <span className="gal-name">{label}</span>
                {p.code && <span className="mono">{p.code}</span>}
                <span className="gal-ask mono">Ask for price →</span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
