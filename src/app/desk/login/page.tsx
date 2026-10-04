import { SwClear } from "@/components/sw";
import Link from "next/link";
import { redirect } from "next/navigation";
import { hasUsers } from "@/app/setup/actions";
import { getSession } from "@/lib/auth";
import { LoginForm } from "@/app/login/form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Voice Desk sign in" };

export default async function DeskLoginPage() {
  if (!(await hasUsers())) redirect("/setup");
  if (await getSession()) redirect("/desk");
  return <><SwClear /><LoginForm subtitle="Voice Desk — site updates by voice" next="desk" footer={<Link href="/login" className="hover:text-ink">Office team? Open the full CRM</Link>} /></>;
}
