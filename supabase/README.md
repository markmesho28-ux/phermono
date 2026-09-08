Supabase schema and migration notes

Files:
- `migrations/001_create_core_tables.sql` — SQL to create core tables used by the app:
  - `products`, `orders`, `categories`
  - `guest_chat_usage`, `user_chat_usage`
  - indexes and triggers to maintain `updated_at`

How to apply

1) Supabase SQL editor (recommended):
   - Open your Supabase project dashboard → SQL Editor
   - Create a new query, paste the contents of `migrations/001_create_core_tables.sql`, and run it.

2) psql (from terminal):
   - Get the connection string from the Supabase dashboard (Settings → Database → Connection string).
   - Run:

```bash
psql <CONNECTION_STRING> -f supabase/migrations/001_create_core_tables.sql
```

Notes about programmatic execution
- The app ships only the `anon` key which is insufficient to run DDL safely from the client. For automated migrations you should use a server-side service role key or the Supabase CLI in CI.
- If you want, I can create a small Node script that attempts to run the SQL using a service role key stored in an environment variable, but take care to keep that key secret.

Contact me which option you prefer and I can help apply the migration or create an automated script.
