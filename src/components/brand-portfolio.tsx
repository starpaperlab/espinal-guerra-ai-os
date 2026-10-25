import type { WorkspaceBrand } from "@/modules/workspace-brands";
import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { brands } from "@/modules/catalog";
import { BrandLogo } from "./brand-logo";

/** One data-driven portfolio, reused in Dashboard and Marcas without a duplicate grid. */
export function BrandPortfolio({
  brandId,
  title = "Portafolio empresarial",
  brands: suppliedBrands,
}: {
  brandId?: string;
  title?: string;
  brands?: readonly WorkspaceBrand[];
}) {
  return (
    <section aria-labelledby="portfolio-heading">
      <div className="section-heading">
        <h2 id="portfolio-heading">{title}</h2>
        <span>El ecosistema Espinal Guerra</span>
      </div>
      <div className="brands-grid">
        {(suppliedBrands ?? brands)
          .filter((b) => !brandId || b.id === brandId)
          .map((b) => (
            <Link className="card brand-card" key={b.slug} href={b.href}>
              <div className="brand-card-top">
                <BrandLogo name={b.name} initials={b.initials} logo={b.logo} />
                <ArrowUpRight size={18} aria-hidden="true" />
              </div>
              <h3>{b.name}</h3>
              <p>{b.description}</p>
              <div className="brand-card-bottom">
                <span className="tag">{b.status}</span>
                <span>
                  Ver espacio <ArrowRight size={16} aria-hidden="true" />
                </span>
              </div>
            </Link>
          ))}
      </div>
    </section>
  );
}
