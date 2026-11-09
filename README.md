# Horror Engine Advisor

The original quiz remains in `horror_engine_advisor.html`. The Next.js app provides Supabase email/password authentication, a protected admin activity view, and an authenticated route that loads the quiz.

## Setup

1. Create a Supabase project.
2. In the Supabase SQL Editor, run `supabase/migrations/202611040001_auth_and_activity_logs.sql`.
   If the first migration was already applied, also run `supabase/migrations/202611040002_admin_email.sql`.
3. In Supabase Auth, enable email confirmations and configure the site URL and allowed redirect URLs for the local or deployed app. Admin access is granted only after the allowlisted email is confirmed.
4. Copy `.env.example` to `.env.local` and fill in the project's **Project URL** and **anon/public key**. Do not put a service-role key in the browser or commit `.env.local`.
5. Install and start the app:

   ```sh
   npm install
   npm run dev
   ```

6. Create an account using the app's sign-up form. Choose your own password (at least 8 characters) and confirm the account through the email sent by Supabase. Administrator access is granted only to the confirmed account `thanaphatsandee@gmail.com`.

   There is no shared/default administrator password. Use the password chosen when creating the account; if it is forgotten, use **ลืมรหัสผ่าน?** on the sign-in page. Other email addresses receive a regular user account.

The admin page shows the latest 500 events. It records successful sign-in/sign-up, sign-out, quiz answer selections, and generated recommendations. Free-text AI prompts and passwords are not stored. Supabase Row Level Security restricts activity and profile reads to the account owner and the configured administrators.
