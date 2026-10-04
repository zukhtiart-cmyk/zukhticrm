import "server-only";
import { and, asc, desc, eq, gte, inArray, isNotNull, ne } from "drizzle-orm";
import { notFound } from "next/navigation";
import { clients, db, designs, milestones, photos, projects, quotes, siteUpdates, snags, stages, visits, warranties } from "@/db";

/**
 * Everything the client portal shows comes through here, so internal data
 * (costs, margins, vendors, internal notes, issues, draft designs) never reaches the page.
 */
export async function loadPortalClient(token: string) {
  if (!token || token.length < 20) notFound();
  const client = await db.query.clients.findFirst({
    where: eq(clients.portalToken, token),
    columns: { id: true, name: true, portalLastSeenAt: true },
    with: {
      projects: {
        columns: { id: true, name: true, code: true, progress: true, status: true, expectedHandover: true },
        orderBy: desc(projects.createdAt),
      },
    },
  });
  if (!client) notFound();
  // Record the visit (at most every 10 minutes).
  if (!client.portalLastSeenAt || Date.now() - client.portalLastSeenAt.getTime() > 10 * 60 * 1000) {
    await db.update(clients).set({ portalLastSeenAt: new Date() }).where(eq(clients.id, client.id));
  }
  return client;
}

export async function loadPortalProject(token: string, projectId: string | undefined) {
  const client = await loadPortalClient(token);
  const id = projectId && client.projects.some((p) => p.id === projectId) ? projectId : client.projects[0]?.id;
  if (!id) return { client, project: null };

  const project = await db.query.projects.findFirst({
    where: and(eq(projects.id, id), eq(projects.clientId, client.id)),
    columns: { id: true, name: true, code: true, siteAddress: true, progress: true, status: true, expectedHandover: true, handedOverAt: true, amcDueAt: true, careNotes: true },
    with: {
      // Snags: no internal assignee/contractor details.
      snags: { columns: { id: true, room: true, description: true, status: true, photoUrl: true, fixedPhotoUrl: true, fromClient: true, createdAt: true }, orderBy: [asc(snags.room), asc(snags.createdAt)] },
      warranties: { columns: { id: true, item: true, brand: true, months: true, startsOn: true, docUrl: true, notes: true }, orderBy: asc(warranties.item) },
      client: { columns: { name: true, phone: true, email: true } },
      office: { columns: { name: true, city: true, currency: true, taxLabel: true, taxRate: true } },
      manager: { columns: { name: true, phone: true } },
      stages: { columns: { id: true, name: true, order: true, status: true, progress: true, plannedEnd: true }, orderBy: asc(stages.order) },
      updates: {
        columns: { id: true, createdAt: true, clientMessage: true },
        where: isNotNull(siteUpdates.clientMessage),
        orderBy: desc(siteUpdates.createdAt),
        limit: 30,
        with: { photos: { columns: { id: true, url: true, caption: true }, where: eq(photos.clientVisible, true) } },
      },
      designs: {
        columns: { id: true, room: true, title: true, version: true, fileUrl: true, fileType: true, notes: true, status: true, clientComment: true, decidedAt: true, sharedAt: true },
        where: ne(designs.status, "DRAFT"),
        orderBy: [asc(designs.room), asc(designs.title), desc(designs.version)],
      },
      milestones: {
        columns: { id: true, label: true, percent: true, amount: true, status: true, invoiceNumber: true, invoicedAt: true, paidAmount: true, paidAt: true, reference: true },
        orderBy: asc(milestones.sortOrder),
        with: { dueStage: { columns: { name: true } } },
      },
      quotes: {
        columns: { id: true, version: true, status: true, currency: true, taxLabel: true, taxRate: true, subtotal: true, tax: true, total: true, lines: true, createdAt: true },
        where: inArray(quotes.status, ["SENT", "ACCEPTED"]),
        orderBy: desc(quotes.version),
      },
      visits: { columns: { id: true, title: true, at: true }, where: gte(visits.at, new Date(Date.now() - 3 * 3600 * 1000)), orderBy: asc(visits.at) },
      orders: { columns: { id: true, item: true, status: true, eta: true } },
    },
  });
  if (!project) notFound();
  return { client, project };
}

export type PortalProject = NonNullable<Awaited<ReturnType<typeof loadPortalProject>>["project"]>;
