import { SuperAdminPanel } from "@/src/Web/Components/SuperAdminPanel";
import { RequireSuperAdminPage } from "@/src/Web/PageAuth";

export default async function AdminPage() {
  await RequireSuperAdminPage("/admin");

  return <SuperAdminPanel />;
}
