-- Somente leitura; executar após up ou antes de baseline.
BEGIN TRANSACTION READ ONLY;
select 'pcp_empresas' objeto,to_regclass('public.pcp_empresas') is not null existe;
select 'pcp_filiais' objeto,to_regclass('public.pcp_filiais') is not null existe;
select 'pcp_usuario_empresas' objeto,to_regclass('public.pcp_usuario_empresas') is not null existe;
select 'pcp_usuario_filiais' objeto,to_regclass('public.pcp_usuario_filiais') is not null existe;
select 'pcp_permissoes' objeto,to_regclass('public.pcp_permissoes') is not null existe;
select 'pcp_perfil_permissoes' objeto,to_regclass('public.pcp_perfil_permissoes') is not null existe;
select 'pcp_auditoria_global' objeto,to_regclass('public.pcp_auditoria_global') is not null existe;

COMMIT;
