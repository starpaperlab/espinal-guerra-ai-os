import { requireWorkspace } from "@/lib/auth";
export const dynamic = "force-dynamic";
export default async function PrivateLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireWorkspace();
  return children;
}
