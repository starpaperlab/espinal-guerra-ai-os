export const brands = [
  {
    id: "espinal-guerra",
    slug: "espinal-guerra",
    logo: "/brand/espinal-guerra-logo.png",
    href: "/dashboard?marca=espinal-guerra",
    name: "Espinal Guerra",
    status: "En catálogo",
    initials: "EG",
    description: "Marca corporativa del grupo empresarial",
  },
  {
    id: "ceo-rentable-os",
    slug: "ceo-rentable-os",
    logo: "/brands/ceo-rentable-os.png",
    href: "/dashboard?marca=ceo-rentable-os",
    name: "CEO Rentable OS",
    status: "En catálogo",
    initials: "CR",
    description: "Gestión y rentabilidad empresarial",
  },
  {
    id: "plannerlab",
    slug: "plannerlab",
    logo: "/brands/plannerlab.png",
    href: "/dashboard?marca=plannerlab",
    name: "PlannerLab",
    status: "En catálogo",
    initials: "PL",
    description: "Planificación y productividad",
  },
  {
    id: "star-paper-lab",
    slug: "star-paper-lab",
    logo: "/brands/star-paper-lab.png",
    href: "/dashboard?marca=star-paper-lab",
    name: "Star Paper Lab",
    status: "En catálogo",
    initials: "SP",
    description: "Creatividad y productos de papelería",
  },
  {
    id: "emprendedora-digital-ia",
    slug: "emprendedora-digital-ia",
    logo: "/brands/emprendedora-digital-con-ia.png",
    href: "/dashboard?marca=emprendedora-digital-ia",
    name: "Emprendedora Digital con IA",
    status: "En catálogo",
    initials: "ED",
    description: "Emprendimiento y educación digital",
  },
] as const;
export const modules = [
  {
    slug: "dashboard",
    name: "Panel ejecutivo",
    icon: "dashboard",
    description: "Una visión clara de tu grupo empresarial.",
  },
  {
    slug: "marcas",
    name: "Marcas",
    icon: "brands",
    description: "Un grupo, múltiples visiones. Todas en un solo lugar.",
  },
  {
    slug: "ventas",
    name: "Ventas y CRM",
    icon: "sales",
    description: "Relaciones comerciales y oportunidades de cada marca.",
  },
  {
    slug: "marketing",
    name: "Marketing",
    icon: "marketing",
    description: "Estrategia, contenido y crecimiento de tus marcas.",
  },
  {
    slug: "operaciones",
    name: "Operaciones",
    icon: "operations",
    description: "Procesos y ejecución del grupo empresarial.",
  },
  {
    slug: "finanzas",
    name: "Finanzas",
    icon: "finance",
    description: "Visibilidad financiera para tomar mejores decisiones.",
  },
  {
    slug: "tecnologia",
    name: "Tecnología",
    icon: "technology",
    description: "La base tecnológica que conecta tu organización.",
  },
  {
    slug: "configuracion",
    name: "Configuración",
    icon: "settings",
    description: "Acceso, organización y configuración del sistema.",
  },
] as const;
export type Module = (typeof modules)[number];
export function selectedBrand(value: string | string[] | undefined) {
  return brands.find((b) => b.id === value);
}
