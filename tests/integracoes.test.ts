import { test } from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { assinarWebhook, conferirAssinatura, criarLimitador, gerarToken, hashToken, proximaTentativaMin, unidadeDoToken, urlWebhookSegura } from "../lib/integracoes";

test("token: formato, hash, unidade e não vaza o valor", () => {
  const t = gerarToken("SUL");
  assert.equal(unidadeDoToken(t.token), "SUL");
  assert.equal(t.hash, hashToken(t.token));
  assert.equal(t.hash.length, 64);
  assert.ok(!t.hash.includes(t.token));
  assert.notEqual(gerarToken("SUL").token, t.token);
  assert.equal(unidadeDoToken("sbl.SUL.zzz"), null);
  assert.equal(unidadeDoToken("abc"), null);
});

test("webhook: assinatura HMAC com janela de tempo e adulteração", () => {
  const corpo = '{"evento":"alerta.criado"}', ts = 1_800_000_000;
  const a = assinarWebhook(corpo, "seg", ts);
  assert.ok(conferirAssinatura(corpo, "seg", ts, a, ts * 1000 + 1000));
  assert.ok(!conferirAssinatura(corpo + " ", "seg", ts, a, ts * 1000));
  assert.ok(!conferirAssinatura(corpo, "outro", ts, a, ts * 1000));
  assert.ok(!conferirAssinatura(corpo, "seg", ts, a, ts * 1000 + 10 * 60_000));
});

test("webhook: URL bloqueia SSRF e exige https", () => {
  assert.ok(urlWebhookSegura("https://erp.cliente.com.br/hook"));
  for (const u of ["http://a.com/x", "https://localhost/x", "https://127.0.0.1/x", "https://10.0.0.5/x", "https://192.168.1.1/x", "https://172.20.0.1/x", "https://169.254.169.254/x", "https://user:pw@a.com/x", "https://intranet/x", "https://srv.local/x", "ftp://a.com", "lixo"])
    assert.ok(!urlWebhookSegura(u), u);
});

test("recuo exponencial e limitador por janela", () => {
  assert.deepEqual([1, 2, 3, 4, 10].map(proximaTentativaMin), [2, 4, 8, 16, 360]);
  const lim = criarLimitador(3, 1000);
  assert.deepEqual([0, 1, 2, 3].map((i) => lim("k", 100 + i)), [false, false, false, true]);
  assert.equal(lim("k", 2000), false);
});

test("segurança: toda rota de API exige sessão/papel/token ou está na lista de exceções revisadas", async () => {
  const achar = async (dir: string): Promise<string[]> => (await Promise.all((await readdir(dir, { withFileTypes: true })).map(async (e) => (e.isDirectory() ? achar(join(dir, e.name)) : e.name === "route.ts" ? [join(dir, e.name)] : [])))).flat();
  const rotas = await achar("app/api");
  const marcadores = /requireRoles|session\(|administradorCentral|estadoUnidades|unidadeHandler|verificarToken|verificarTokenRastreio|authorization|achar\(token/i;
  const revisadas = new Set(["app/api/auth/login/route.ts", "app/api/auth/logout/route.ts"]);
  const sem: string[] = [];
  for (const r of rotas) if (!revisadas.has(r) && !marcadores.test(await readFile(r, "utf8"))) sem.push(r);
  assert.deepEqual(sem, []);
  // rotas de escrita de módulos novos nunca ficam abertas a qualquer perfil
  for (const r of ["app/api/integracoes/route.ts"]) assert.match(await readFile(r, "utf8"), /requireRoles\(\[\.\.\.ROLES\]\)/);
  assert.match(await readFile("app/api/integracoes/route.ts", "utf8"), /ROLES = \["GERENTE"\]/);
});
