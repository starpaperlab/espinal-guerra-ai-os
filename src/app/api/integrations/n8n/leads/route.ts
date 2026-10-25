import { signedIngestion } from "@/modules/automation/ingestion";
export const runtime = "nodejs";
export async function POST(request: Request) {
  return signedIngestion(request, "n8n");
}
