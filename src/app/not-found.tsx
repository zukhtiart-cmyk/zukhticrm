import Link from "next/link";
import { ZukiFace } from "@/components/zuki";

export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center px-4">
      <div className="page-in max-w-sm text-center">
        <div className="mb-4 flex justify-center">
          <ZukiFace size={72} />
        </div>
        <h1 className="h-display text-3xl">This page isn't here</h1>
        <p className="mt-2 text-sm text-muted">
          The link may be old or mistyped. If someone sent it to you, ask them
          for a fresh one.
        </p>
        <Link href="/" className="btn-primary mt-6">
          Go to the start
        </Link>
      </div>
    </main>
  );
}
