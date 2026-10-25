import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/auth";
import { modules, selectedBrand } from "@/modules/catalog";
import { Workspace } from "@/components/workspace";
export default async function ModulePage({
  params,
  searchParams,
}: {
  params: Promise<{ module: string }>;
  searchParams: Promise<{ marca?: string | string[] }>;
}) {
  const workspace = await requireWorkspace();
  const [{ module: slug }, query] = await Promise.all([params, searchParams]);
  const moduleConfig = modules.find((m) => m.slug === slug);
  if (!moduleConfig) notFound();
  return (
    <Workspace
      module={moduleConfig}
      brandId={selectedBrand(query.marca)?.id}
      email={workspace.user.email}
    />
  );
}
