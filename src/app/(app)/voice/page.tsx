import { and, desc, eq, ne } from "drizzle-orm";
import { db, projects } from "@/db";
import { officeScope, requireUser } from "@/lib/auth";
import { can, defaultSendToClient } from "@/lib/permissions";
import { whatsappConfigured } from "@/lib/whatsapp";
import { VoiceDesk } from "./voice-desk";

export const metadata = { title: "Voice desk" };

export default async function VoicePage({ searchParams }: { searchParams: Promise<{ project?: string }> }) {
  const user = await requireUser("voice");
  const { project: preselect } = await searchParams;
  const scope = officeScope(user);
  const rows = await db.query.projects.findMany({
    where: and(scope ? eq(projects.officeId, scope) : undefined, ne(projects.status, "HANDED_OVER")),
    with: { client: true },
    orderBy: desc(projects.createdAt),
  });

  return (
    <VoiceDesk
      projects={rows.map((p) => ({ id: p.id, name: p.name, client: p.client.name, code: p.code }))}
      initialProjectId={rows.some((p) => p.id === preselect) ? preselect! : (rows[0]?.id ?? "")}
      defaultSend={defaultSendToClient[user.role]}
      whatsappReady={whatsappConfigured()}
      perms={{
        stages: can(user.role, "stages"),
        payments: can(user.role, "payments"),
        orders: can(user.role, "orders"),
        visits: can(user.role, "visits"),
        design: can(user.role, "design"),
      }}
    />
  );
}
