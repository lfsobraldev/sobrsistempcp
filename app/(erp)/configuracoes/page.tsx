import { redirect } from "next/navigation";

// Metas e producao manuais ficam suspensas ate a integracao dos apontamentos de todos os filtros via API Consistem.
export default function Configuracoes() {
  redirect("/dashboard");
}
