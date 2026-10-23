#!/usr/bin/env bash
# Aplica, na ordem, todos os arquivos de docs/banco/colar em UM banco, sem copiar um por um.
# Uso:   scripts/aplicar-banco.sh "postgresql://usuario:senha@host/banco?sslmode=require" [central]
# - Cada arquivo roda em transação própria. Arquivo já aplicado é pulado ("já registrado").
# - Qualquer outro erro para tudo, e o arquivo com erro não deixa nada pela metade.
# - Com o 2º argumento "central", aplica só o arquivo do banco central de usuários (migração 29).
set -uo pipefail
URL="${1:?Informe a URL do banco}"
DIR="$(cd "$(dirname "$0")/../docs/banco/colar" && pwd)"
command -v psql >/dev/null || { echo "psql não encontrado (instale o cliente PostgreSQL)."; exit 2; }

if [ "${2:-}" = "central" ]; then ORDEM=(UNICO_CENTRAL_29.sql)
else
  ORDEM=(PARTE_1_de_4.sql PARTE_2_de_4.sql PARTE_3_de_4.sql PARTE_4_de_4.sql
         1_registro_de_migracoes_SE_AINDA_NAO_EXISTIR.sql 2_migracao_25_producao_estoque_financeiro.sql 3_migracao_26_sac_qualidade_oee.sql
         5_migracao_27_wms_revisoes_sobras.sql 6_migracao_28_rh_ehs_projetos.sql 7_migracao_29_CENTRAL_cargos_identidade.sql
         8_migracao_30_seguranca_aprovacoes_auditoria.sql 9_migracao_31_embalagem_mrp_horizonte.sql 10_migracao_32_compras_qualidade_comercial.sql
         11_migracao_33_financeiro_fechamento_rateio_margem.sql 12_migracao_34_plataforma_eventos_campos_notificacoes.sql 13_migracao_35_pessoas_ehs_projetos.sql
         14_migracao_36.sql 15_migracao_37.sql 16_migracao_38.sql 17_migracao_39.sql 18_migracao_40.sql)
fi

for f in "${ORDEM[@]}"; do
  [ -f "$DIR/$f" ] || { echo "FALTA o arquivo $f"; exit 1; }
  saida="$(psql "$URL" -v ON_ERROR_STOP=1 -X -q -f "$DIR/$f" 2>&1)"; rc=$?
  if [ $rc -eq 0 ]; then echo "OK      $f"
  elif grep -qi "já registrado" <<<"$saida"; then echo "JÁ HAVIA $f"
  else echo "ERRO    $f"; echo "$saida" | tail -8; exit 1; fi
done
echo "Concluído. Rode a verificação: psql \"\$URL\" -f docs/banco/colar/4_verificar_tudo.sql"
