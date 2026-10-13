import { redirect } from "next/navigation";

/** Módulo desativado: apontamentos oficiais serão lidos do Consistem. */
export default function ApontamentosDesativado() {
  redirect("/lideres");
}
