import { requireUser } from "@/lib/auth";
import { can, roleLabels } from "@/lib/permissions";
import { Sidebar, type NavItem } from "@/components/nav";
import { logout } from "@/app/login/actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const items: NavItem[] = [
    { href: "/", label: "Today", icon: "home" },
    ...(can(user.role, "leads") ? [{ href: "/leads", label: "Leads", icon: "leads" } as NavItem] : []),
    { href: "/projects", label: "Projects", icon: "projects" },
    { href: "/voice", label: "Voice desk", icon: "voice" },
    ...(can(user.role, "rates") ? [{ href: "/rates", label: "Rates", icon: "rates" } as NavItem] : []),
    ...(can(user.role, "admin") ? [{ href: "/admin", label: "Team", icon: "admin" } as NavItem] : []),
  ];
  return (
    <div className="min-h-screen">
      <Sidebar items={items} userName={user.name} roleLabel={roleLabels[user.role]} office={user.office?.name ?? "All offices"} logout={logout} />
      <main className="px-4 pb-28 pt-5 sm:px-6 lg:ml-60 lg:px-10 lg:pb-12 lg:pt-10 print:ml-0 print:p-0">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
