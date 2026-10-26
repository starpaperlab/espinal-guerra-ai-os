import { CommercialReport } from "@/modules/journey/report";
import { workspaceBrands } from "@/modules/workspace-brands";
import { Workspace } from "@/components/workspace";
import { modules } from "@/modules/catalog";
import { crmContext, loadCrm } from "@/modules/crm/data";
import { CrmView, CrmBrandFilter } from "@/modules/crm/view";
export const dynamic = "force-dynamic";
export default async function SalesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { user } = await crmContext();
  const raw = await searchParams;
  const query = Object.fromEntries(
    Object.entries(raw).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
  const data = await loadCrm(query);
  return (
    <Workspace
      module={modules.find((m) => m.slug === "ventas")!}
      brandId={data.selectedBrand?.slug}
      email={user.email}
      availableBrands={workspaceBrands(data.brands)}
      headerControl={<CrmBrandFilter data={data} />}
    >
      <CrmView data={data} />
      <CommercialReport brandId={data.selectedBrand?.id} />
    </Workspace>
  );
}
