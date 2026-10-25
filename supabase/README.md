# Supabase setup

The initial schema was applied to the linked project. The SQL file is the source snapshot for review; do not rerun it against the already migrated project without resetting or making a new migration. Configure the secrets listed in `.env.example` through Supabase Edge Function secrets. The InfinitePay webhook URL must include `?token=YOUR_WEBHOOK_TOKEN`; configure the same random token as `INFINITEPAY_WEBHOOK_TOKEN`. The admin UI requires a protected `app_metadata.role = admin` claim; do not use editable `user_metadata` for authorization.
