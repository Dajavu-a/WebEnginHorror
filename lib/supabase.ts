import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let browserClient: SupabaseClient | undefined;

export function getSupabaseClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "ยังไม่ได้ตั้งค่าระบบล็อกอิน: คัดลอก .env.example เป็น .env.local แล้วใส่ Supabase Project URL และ anon/public key จากหน้า Project Settings > API จากนั้นปิดและเปิด npm run dev ใหม่",
    );
  }

  if (!browserClient) {
    browserClient = createClient(url, anonKey);
  }

  return browserClient;
}
