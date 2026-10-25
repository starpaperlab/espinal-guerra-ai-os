-- Ejecutar DESPUÉS de revisar automation-audit.sql y aplicar la migración 006.
-- Solo SQL Editor/operador autorizado. Reutiliza una organización reconocida
-- y su único administrador existente. NO crea organizaciones por defecto.
select public.crm_bootstrap_enterprise() as report;

-- Si el nombre de la organización no coincide, usar el UUID confirmado en auditoría:
-- select public.crm_bootstrap_enterprise(p_org => '<UUID existente confirmado>'::uuid) as report;
-- Si hay varios administradores, indicar también p_admin con el UUID verificado.
-- No activar p_allow_create ni p_grant_admin sin confirmar antes esa necesidad.
