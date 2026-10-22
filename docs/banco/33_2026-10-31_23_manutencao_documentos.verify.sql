-- Somente leitura; executar após up ou antes de baseline.
BEGIN TRANSACTION READ ONLY;
select 'mnt_ativos' objeto,to_regclass('public.mnt_ativos') is not null existe;
select 'mnt_planos' objeto,to_regclass('public.mnt_planos') is not null existe;
select 'mnt_ordens' objeto,to_regclass('public.mnt_ordens') is not null existe;
select 'mnt_paradas' objeto,to_regclass('public.mnt_paradas') is not null existe;
select 'mnt_pecas' objeto,to_regclass('public.mnt_pecas') is not null existe;
select 'doc_documentos' objeto,to_regclass('public.doc_documentos') is not null existe;
select 'doc_versoes' objeto,to_regclass('public.doc_versoes') is not null existe;
select 'doc_vinculos' objeto,to_regclass('public.doc_vinculos') is not null existe;
select 'doc_leituras' objeto,to_regclass('public.doc_leituras') is not null existe;
select 'qlf_config' objeto,to_regclass('public.qlf_config') is not null existe;
select 'qlf_requisitos' objeto,to_regclass('public.qlf_requisitos') is not null existe;
select 'qlf_qualificacoes' objeto,to_regclass('public.qlf_qualificacoes') is not null existe;

COMMIT;
