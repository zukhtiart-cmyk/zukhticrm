import { redirect } from "next/navigation";
import { hasUsers } from "@/app/setup/actions";
import { LoginForm } from "./form";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  // Fresh install: send the first visitor to the one-time owner setup.
  if (!(await hasUsers())) redirect("/setup");
  return <LoginForm />;
}
