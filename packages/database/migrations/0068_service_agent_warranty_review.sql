-- Front-line service agents record preliminary warranty assessments in the case
-- workflow. Migration 0026 only granted service.warranty.review to system_admin,
-- so every warranty review from a service_agent was rejected with 403.
INSERT INTO identity.role_permissions(role_id,permission_id)
VALUES ('service_agent','service.warranty.review')
ON CONFLICT DO NOTHING;
