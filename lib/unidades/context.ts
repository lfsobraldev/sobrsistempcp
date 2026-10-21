import { AsyncLocalStorage } from 'node:async_hooks';
import type { Unidade } from './core';
export type ContextoUnidade={unidade:Unidade;usuario:string};
export const contextoUnidade=new AsyncLocalStorage<ContextoUnidade>();
export function unidadeAtual(){return contextoUnidade.getStore()?.unidade??null;}
export {canalUnidade} from "./context-client";
