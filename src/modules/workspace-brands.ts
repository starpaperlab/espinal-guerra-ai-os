import { brands as catalog } from "./catalog";
export type WorkspaceBrand = {
  id: string;
  slug: string;
  name: string;
  logo: string | null;
  href: string;
  initials: string;
  description: string;
  status: string;
};
export function workspaceBrands(
  rows: readonly { id: string; slug: string; name: string }[],
): WorkspaceBrand[] {
  return rows.map((row) => {
    const decoration = catalog.find(
      (b) =>
        b.slug === row.slug || b.name.toLowerCase() === row.name.toLowerCase(),
    );
    return {
      ...row,
      logo: decoration?.logo || null,
      href: `/dashboard?marca=${encodeURIComponent(row.slug)}`,
      initials:
        decoration?.initials ||
        row.name
          .split(/\s+/)
          .slice(0, 2)
          .map((w) => w[0])
          .join("")
          .toUpperCase(),
      description: decoration?.description || "Marca del grupo empresarial",
      status: "Registrada",
    };
  });
}
