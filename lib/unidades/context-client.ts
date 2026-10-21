export function canalUnidade(unidade:'SUL'|'NORDESTE'|null){return unidade?`private-sobral-pcp-${unidade.toLowerCase()}`:'sobral-pcp-live';}
