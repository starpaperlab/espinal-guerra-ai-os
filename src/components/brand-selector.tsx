"use client";
import { useRouter, usePathname } from "next/navigation";
import { brands } from "@/modules/catalog";
export function BrandSelector({ value }: { value?: string }) {
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
          <option value={b.id} key={b.id}>
            {b.name}
          </option>
        ))}
      </select>
    </label>
  );
}
