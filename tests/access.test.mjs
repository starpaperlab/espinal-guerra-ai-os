import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
const base = "http://127.0.0.1:3187";
let server;
before(async () => {
  const env = { ...process.env, NEXT_TELEMETRY_DISABLED: "1" };
  delete env.NEXT_PUBLIC_SUPABASE_URL;
  delete env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  delete env.SUPABASE_SERVICE_ROLE_KEY;
  delete env.CRM_WEBHOOK_SECRET;
  delete env.CRM_WEBHOOK_ORGANIZATION_ID;
  server = spawn(
    process.execPath,
    [
      "node_modules/next/dist/bin/next",
      "start",
      "-H",
      "127.0.0.1",
      "-p",
      "3187",
    ],
    { env, stdio: "pipe" },
  );
  let logs = "";
  server.stdout.on("data", (data) => {
    logs += data;
  });
  server.stderr.on("data", (data) => {
    logs += data;
  });
  for (let attempt = 0; attempt < 80; attempt++) {
    if (server.exitCode !== null) throw new Error(logs);
    try {
      await fetch(base + "/configuracion-pendiente");
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw new Error("El servidor no inició: " + logs);
});
after(async () => {
  if (server && server.exitCode === null) {
    const exited = new Promise((resolve) => server.once("exit", resolve));
    server.kill("SIGTERM");
    await exited;
  }
});
for (const path of [
  "dashboard",
  "marcas",
  "ventas",
  "marketing",
  "operaciones",
  "finanzas",
  "tecnologia",
  "configuracion",
]) {
  test(`/${path} bloquea acceso directo sin configuración`, async () => {
    const response = await fetch(`${base}/${path}?marca=ceo-rentable-os`, {
      redirect: "manual",
    });
    assert.equal(response.status, 307);
    assert.equal(response.headers.get("location"), "/configuracion-pendiente");
    const body = await response.text();
    assert.ok(!body.includes("El siguiente capítulo"));
  });
}
test("Login no permite acceso sin Supabase", async () => {
  const response = await fetch(base + "/login", { redirect: "manual" });
  assert.equal(response.status, 307);
  assert.equal(response.headers.get("location"), "/configuracion-pendiente");
});
test("Pantalla pendiente explica el bloqueo y aplica cabeceras", async () => {
  const response = await fetch(base + "/configuracion-pendiente");
  const body = await response.text();
  assert.equal(response.status, 200);
  assert.match(body, /Configuración pendiente/);
  assert.match(body, /lang="es"/);
  assert.equal(response.headers.get("x-frame-options"), "DENY");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.ok(!body.includes("El siguiente capítulo"));
});
test("Inicio dirige al panel protegido", async () => {
  const response = await fetch(base, { redirect: "manual" });
  assert.equal(response.status, 307);
  assert.equal(response.headers.get("location"), "/dashboard");
});

test("Receptor n8n sin configuración no acepta escrituras", async () => {
  const response = await fetch(base + "/api/integrations/n8n/leads", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  assert.equal(response.status, 503);
  assert.match(await response.text(), /no configurada/);
});
