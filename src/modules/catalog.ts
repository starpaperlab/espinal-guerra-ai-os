export const brands = [
  {
    id: "ceo-rentable-os",
    name: "CEO Rentable OS",
    initials: "CR",
    description: "Gestión y rentabilidad empresarial",
    color: "violet",
  },
  {
    id: "plannerlab",
    name: "PlannerLab",
    initials: "PL",
    description: "Planificación y productividad",
    color: "blue",
  },
  {
    id: "star-paper-lab",
    name: "Star Paper Lab",
    initials: "SP",
    description: "Creatividad y productos de papelería",
    color: "rose",
  },
  {
    id: "emprendedora-digital-ia",
    name: "Emprendedora Digital con IA",
    initials: "ED",
    description: "Emprendimiento y educación digital",
    color: "amber",
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
