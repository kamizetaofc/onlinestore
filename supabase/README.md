# Supabase

As migrações versionadas em `migrations/` correspondem ao histórico aplicado ao projeto Supabase. Para um banco novo, execute-as na ordem do nome/timestamp com a Supabase CLI. O banco conectado nesta implementação já recebeu essas alterações; não execute a migração inicial novamente manualmente.

Configure os secrets das Edge Functions pelo Dashboard do Supabase. A função administrativa valida `app_metadata.role = admin`, nunca metadados editáveis pelo próprio usuário. A URL do webhook InfinitePay precisa incluir `?token=...` com o mesmo valor definido em `INFINITEPAY_WEBHOOK_TOKEN`.