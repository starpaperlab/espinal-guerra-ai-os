import { signedIngestion } from "@/modules/automation/ingestion";
export const runtime = "nodejs";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ sourceKey: string }> },
) {
  const { sourceKey } = await params;
  if (!/^[a-z0-9][a-z0-9_-]{2,99}$/.test(sourceKey))
    return Response.json({ error: "Fuente no disponible" }, { status: 404 });
  return signedIngestion(request, "signed_backend", sourceKey);
}
