import { Workspace } from "@/components/workspace";
import { modules } from "@/modules/catalog";
import { workspaceBrands } from "@/modules/workspace-brands";
import { loadEnterprise } from "@/modules/automation/data";
import { EnterpriseView } from "@/modules/automation/view";
import { requireWorkspace } from "@/lib/auth";
export const dynamic = "force-dynamic";
export default async function ConfigurationPage({
  searchParams,
}: {
  searchParams: Promise<{ resultado?: string }>;
}) {
  const { user } = await requireWorkspace();
  const data = await loadEnterprise();
  const { resultado } = await searchParams;
  return (
    <Workspace
      module={modules.find((m) => m.slug === "configuracion")!}
      email={user.email}
      availableBrands={workspaceBrands(data.brands)}
    >
      <EnterpriseView data={data} result={resultado} />
    </Workspace>
  );
}
