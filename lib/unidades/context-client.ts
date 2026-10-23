export function canalUnidade(unidade:'SUL'|'NORDESTE'|'MADEIRAS'|null){return unidade?`private-sobral-pcp-${unidade.toLowerCase()}`:'sobral-pcp-live';}
