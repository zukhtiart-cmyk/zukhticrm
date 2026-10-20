import Link from "next/link";

export default function NotFound() {
  return (
    <section className="lost dark" data-stratum="Unmapped">
      <p className="overline mono">Error 404 · unmapped bed</p>
      <h1 className="display">
        We drilled here. <em>Nothing but air.</em>
      </h1>
      <Link href="/" className="btn btn-ochre"><span>Back to the surface</span></Link>
    </section>
  );
}
