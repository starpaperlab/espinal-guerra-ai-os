import { Workspace } from "@/components/workspace";
import { modules } from "@/modules/catalog";
import { workspaceBrands } from "@/modules/workspace-brands";
import { requireWorkspace } from "@/lib/auth";
import { loadMarketing } from "@/modules/marketing/data";
import { MarketingView } from "@/modules/marketing/view";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export default async function MarketingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { user } = await requireWorkspace();
  const raw = await searchParams;
  const query = Object.fromEntries(
    Object.entries(raw).filter(
      (e): e is [string, string] => typeof e[1] === "string",
    ),
  );
  const data = await loadMarketing(query);
  return (
    <Workspace
      module={modules.find((m) => m.slug === "marketing")!}
      email={user.email}
      availableBrands={workspaceBrands(data.brands)}
      brandId={data.selectedBrand}
    >
      <MarketingView data={data} result={query.resultado} />
    </Workspace>
  );
}
