import { DoorLoader } from "@/components/door-art";

export default function Loading() {
  return <div className="page-loading"><DoorLoader label="Carregando módulo" sub="Buscando dados da operação" /></div>;
}
