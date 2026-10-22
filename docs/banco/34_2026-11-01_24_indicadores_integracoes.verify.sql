-- Somente leitura; executar após up ou antes de baseline.
BEGIN TRANSACTION READ ONLY;
select 'sys_alertas' objeto,to_regclass('public.sys_alertas') is not null existe;
select 'sys_tokens_api' objeto,to_regclass('public.sys_tokens_api') is not null existe;
select 'sys_webhooks' objeto,to_regclass('public.sys_webhooks') is not null existe;
select 'sys_webhook_fila' objeto,to_regclass('public.sys_webhook_fila') is not null existe;

COMMIT;
