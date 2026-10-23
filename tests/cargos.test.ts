import { test } from "node:test";
import assert from "node:assert/strict";
import { PERFIL_BASE, sessaoHoras } from "@/lib/auth";
import { allowedPath } from "@/lib/permissions";
import { PERFIS } from "@/lib/unidades/users";

test("cargos acima herdam o perfil-base e a sessão é configurável", () => {
  assert.equal(PERFIL_BASE.DIRETOR, "GERENTE");
  assert.equal(PERFIL_BASE.SUPERVISOR, "ENCARREGADO");
  assert.ok(["DIRETOR", "SUPERVISOR", "ADMINISTRADOR"].every((c) => (PERFIS as readonly string[]).includes(c)));
  assert.equal(allowedPath("DIRETOR", "/financeiro"), true);
  assert.equal(allowedPath("SUPERVISOR", "/wms"), true);
  assert.equal(allowedPath("DIRETOR", "/seguranca"), true);
  assert.equal(allowedPath("LIDER", "/seguranca"), false);
  for (const perfil of ["LIDER", "APONTADOR", "LIDER_ENTREGAS"] as const)
    for (const rota of ["/configuracoes", "/acessos", "/plataforma", "/mapa-fabrica", "/seguranca", "/dashboard"]) assert.equal(allowedPath(perfil, rota), false, `${perfil} ${rota}`);
  assert.equal(allowedPath("LIDER", "/apontamento-operacoes"), true);
  assert.equal(allowedPath("LIDER_ENTREGAS", "/apontamento-entregas"), true);
  const antes = process.env.SESSAO_HORAS;
  try {
    delete process.env.SESSAO_HORAS; assert.equal(sessaoHoras(), 12);
    process.env.SESSAO_HORAS = "8"; assert.equal(sessaoHoras(), 8);
    process.env.SESSAO_HORAS = "99"; assert.equal(sessaoHoras(), 12);
  } finally { if (antes === undefined) delete process.env.SESSAO_HORAS; else process.env.SESSAO_HORAS = antes; }
});
