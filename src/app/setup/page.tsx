import { redirect } from "next/navigation";
import { hasUsers } from "./actions";
import { SetupForm } from "./form";

export const dynamic = "force-dynamic";
export const metadata = { title: "First-time setup", robots: { index: false } };

export default async function SetupPage() {
  if (await hasUsers()) redirect("/login");
  return (
    <main className="grid min-h-screen place-items-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <p className="h-display text-4xl">Zukhti Home</p>
          <p className="mt-1 text-sm text-muted">First-time setup — create the owner account</p>
        </div>
        <SetupForm />
        <p className="mt-4 text-center text-xs text-muted">This page disappears once the first account exists.</p>
      </div>
    </main>
  );
}
