"use client";
import { useRouter, usePathname } from "next/navigation";
import { brands as catalogBrands } from "@/modules/catalog";
export function BrandSelector({
  value,
  brands = catalogBrands,
}: {
  value?: string;
  brands?: readonly { slug: string; name: string }[];
}) {
  const router = useRouter();
  const path = usePathname();
  return (
    <label className="brand-selector">
      <span>Espacio de trabajo</span>
      <select
        aria-label="Seleccionar marca"
        value={value ?? ""}
        onChange={(event) =>
          router.push(
            path +
              (event.target.value
                ? "?marca=" + encodeURIComponent(event.target.value)
                : ""),
          )
        }
      >
        <option value="">Todas las marcas</option>
        {brands.map((b) => (
          <option value={b.slug} key={b.slug}>
            {b.name}
          </option>
        ))}
      </select>
    </label>
  );
}
