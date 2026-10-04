import { redirect } from "next/navigation";

/** Old address; the voice desk now lives at /desk. */
export default async function VoiceRedirect({ searchParams }: { searchParams: Promise<{ project?: string }> }) {
  const { project } = await searchParams;
  redirect(project ? `/desk?project=${encodeURIComponent(project)}` : "/desk");
}
