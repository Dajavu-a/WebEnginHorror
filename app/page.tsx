"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { getSupabaseClient } from "@/lib/supabase";

type ActivityType =
  | "login_success"
  | "signup_success"
  | "logout"
  | "answer_selected"
  | "recommendation_generated";

type ActivityDetails = Record<string, string>;
type AuthMode = "login" | "signup" | "forgot_password" | "reset_password" | "verify_email";

type ActivityRow = {
  id: number;
  user_id: string;
  event_type: ActivityType;
  details: ActivityDetails;
  created_at: string;
};

type ProfileRow = {
  id: string;
  email: string;
  role: "admin" | "user";
};

type AdvisorMessage =
  | {
      source: "horror-engine-advisor";
      event: "answer_selected";
      details: {
        questionId: string;
        question: string;
        optionId: string;
        answer: string;
      };
    }
  | {
      source: "horror-engine-advisor";
      event: "recommendation_generated";
      details: {
        method: "quiz" | "ai";
        firstChoice: string;
        secondChoice: string;
      };
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function limitText(value: unknown, length: number): string | null {
  return typeof value === "string" && value.length > 0 && value.length <= length
    ? value
    : null;
}

function getAuthErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return "ดำเนินการไม่สำเร็จ กรุณาลองอีกครั้ง";

  const message = error.message.toLowerCase();
  if (message.includes("invalid login credentials")) {
    return "อีเมลหรือรหัสผ่านไม่ถูกต้อง หากยังไม่เคยสมัคร ให้เลือก “สมัครสมาชิก”";
  }
  if (message.includes("email not confirmed")) {
    return "อีเมลนี้ยังไม่ได้ยืนยัน กรุณาเปิดอีเมลและกดลิงก์ยืนยันก่อนเข้าสู่ระบบ";
  }
  if (message.includes("user already registered")) {
    return "อีเมลนี้มีบัญชีแล้ว กรุณาเข้าสู่ระบบ หรือเลือก “ลืมรหัสผ่าน”";
  }
  if (message.includes("password should be at least")) {
    return "รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร";
  }
  if (message.includes("token") && (message.includes("invalid") || message.includes("expired"))) {
    return "รหัสยืนยันไม่ถูกต้องหรือหมดอายุ กรุณาตรวจอีเมลหรือส่งอีเมลยืนยันอีกครั้ง";
  }
  if (message.includes("rate limit") || message.includes("too many requests")) {
    return "ทำรายการบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่";
  }
  if (message.includes("failed to fetch")) {
    return "เชื่อมต่อระบบไม่ได้ กรุณาตรวจอินเทอร์เน็ตและการตั้งค่า Supabase";
  }
  return `ระบบแจ้งข้อผิดพลาด: ${error.message}`;
}

function parseAdvisorMessage(value: unknown): AdvisorMessage | null {
  if (!isRecord(value) || value.source !== "horror-engine-advisor") return null;
  if (!isRecord(value.details)) return null;

  if (value.event === "answer_selected") {
    const { details } = value;
    const questionId = limitText(details.questionId, 80);
    const question = limitText(details.question, 500);
    const optionId = limitText(details.optionId, 80);
    const answer = limitText(details.answer, 300);
    if (!questionId || !question || !optionId || !answer) return null;
    return {
      source: "horror-engine-advisor",
      event: "answer_selected",
      details: { questionId, question, optionId, answer },
    };
  }

  if (value.event === "recommendation_generated") {
    const { details } = value;
    const method = details.method;
    const firstChoice = limitText(details.firstChoice, 100);
    const secondChoice = limitText(details.secondChoice, 100);
    if (
      (method !== "quiz" && method !== "ai") ||
      !firstChoice ||
      !secondChoice
    ) {
      return null;
    }
    return {
      source: "horror-engine-advisor",
      event: "recommendation_generated",
      details: { method, firstChoice, secondChoice },
    };
  }

  return null;
}

function formatDetails(row: ActivityRow): string {
  const details = row.details ?? {};
  switch (row.event_type) {
    case "answer_selected":
      return `${details.question ?? "คำถาม"} → ${details.answer ?? "คำตอบ"}`;
    case "recommendation_generated":
      return `${details.firstChoice ?? "-"} / ${details.secondChoice ?? "-"}` +
        ` (${details.method === "ai" ? "วิเคราะห์จากข้อความ" : "แบบทดสอบ"})`;
    case "signup_success":
      return "สมัครบัญชีสำเร็จ";
    case "login_success":
      return "เข้าสู่ระบบสำเร็จ";
    case "logout":
      return "ออกจากระบบ";
  }
}

function formatEvent(type: ActivityType): string {
  switch (type) {
    case "login_success":
      return "เข้าสู่ระบบ";
    case "signup_success":
      return "สมัครสมาชิก";
    case "logout":
      return "ออกจากระบบ";
    case "answer_selected":
      return "เลือกคำตอบ";
    case "recommendation_generated":
      return "สร้างผลแนะนำ";
  }
}

export default function Home() {
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [role, setRole] = useState<ProfileRow["role"] | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [verificationCode, setVerificationCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [authErrorModal, setAuthErrorModal] = useState("");
  const [message, setMessage] = useState("");
  const [messageIsError, setMessageIsError] = useState(false);
  const [advisorUrl, setAdvisorUrl] = useState("");
  const [adminOpen, setAdminOpen] = useState(false);
  const [adminLoading, setAdminLoading] = useState(false);
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [activities, setActivities] = useState<ActivityRow[]>([]);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const showMessage = useCallback((text: string, isError = false) => {
    setMessage(text);
    setMessageIsError(isError);
  }, []);

  const logActivity = useCallback(
    async (eventType: ActivityType, details: ActivityDetails = {}) => {
      const { error } = await getSupabaseClient()
        .from("activity_logs")
        .insert({ event_type: eventType, details });
      if (error) throw error;
    },
    [],
  );

  useEffect(() => {
    let active = true;
    let subscription: { unsubscribe: () => void } | undefined;

    try {
      const supabase = getSupabaseClient();
      void supabase.auth.getSession().then(({ data, error }) => {
        if (!active) return;
        if (error) showMessage(error.message, true);
        setSession(data.session);
        setAuthLoading(false);
      });

      const result = supabase.auth.onAuthStateChange((event, nextSession) => {
        if (!active) return;
        if (event === "PASSWORD_RECOVERY") setAuthMode("reset_password");
        setSession(nextSession);
      });
      subscription = result.data.subscription;
    } catch (error) {
      showMessage(
        error instanceof Error ? error.message : "ตั้งค่าระบบไม่ครบ",
        true,
      );
      setAuthLoading(false);
    }

    return () => {
      active = false;
      subscription?.unsubscribe();
    };
  }, [showMessage]);

  useEffect(() => {
    let active = true;
    let contentUrl: string | null = null;
    if (!session) {
      setRole(null);
      setAdvisorUrl("");
      return;
    }
    const currentSession = session;
    setAdvisorUrl("");

    async function loadSignedInPage() {
      try {
        const supabase = getSupabaseClient();
        const [profileResult, contentResult] = await Promise.all([
          supabase
            .from("profiles")
            .select("id,email,role")
            .eq("id", currentSession.user.id)
            .single(),
          fetch("/api/advisor-content", {
            headers: { Authorization: `Bearer ${currentSession.access_token}` },
            cache: "no-store",
          }),
        ]);

        if (profileResult.error) throw profileResult.error;
        if (!contentResult.ok) {
          const result = (await contentResult.json()) as { error?: string };
          throw new Error(result.error || "เปิดเครื่องมือไม่สำเร็จ");
        }

        const html = await contentResult.text();
        const url = URL.createObjectURL(
          new Blob([html], { type: "text/html" }),
        );
        contentUrl = url;
        if (!active) {
          URL.revokeObjectURL(url);
          contentUrl = null;
          return;
        }
        setRole(profileResult.data.role);
        setAdvisorUrl(url);
      } catch (error) {
        if (!active) return;
        showMessage(
          error instanceof Error ? error.message : "โหลดข้อมูลไม่สำเร็จ",
          true,
        );
      }
    }

    void loadSignedInPage();
    return () => {
      active = false;
      if (contentUrl) URL.revokeObjectURL(contentUrl);
    };
  }, [session, showMessage]);

  useEffect(() => {
    function handleMessage(event: MessageEvent<unknown>) {
      if (event.origin !== window.location.origin) return;
      if (event.source !== iframeRef.current?.contentWindow || !session) return;

      const parsed = parseAdvisorMessage(event.data);
      if (!parsed) return;
      void logActivity(parsed.event, parsed.details).catch((error: unknown) => {
        showMessage(
          error instanceof Error
            ? `บันทึกกิจกรรมไม่สำเร็จ: ${error.message}`
            : "บันทึกกิจกรรมไม่สำเร็จ",
          true,
        );
      });
    }

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [logActivity, session, showMessage]);

  async function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");

    try {
      const supabase = getSupabaseClient();
      if (authMode === "forgot_password") {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: window.location.origin,
        });
        if (error) throw error;
        showMessage("ส่งลิงก์ตั้งรหัสผ่านใหม่ไปที่อีเมลแล้ว กรุณาตรวจกล่องจดหมายและอีเมลขยะ");
        return;
      }

      if (authMode === "reset_password") {
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
        setPassword("");
        setAuthMode("login");
        showMessage("เปลี่ยนรหัสผ่านสำเร็จแล้ว");
        return;
      }

      if (authMode === "verify_email") {
        const { data, error } = await supabase.auth.verifyOtp({
          email: email.trim(),
          token: verificationCode.trim(),
          type: "signup",
        });
        if (error) throw error;
        setVerificationCode("");
        if (!data.session) {
          setAuthMode("login");
          showMessage("ยืนยันอีเมลสำเร็จแล้ว กรุณาเข้าสู่ระบบ");
          return;
        }
        try {
          await logActivity("signup_success");
          showMessage("ยืนยันอีเมลและสมัครสมาชิกสำเร็จ");
        } catch (activityError) {
          showMessage(
            activityError instanceof Error
              ? `สมัครสำเร็จแล้ว แต่บันทึกกิจกรรมไม่สำเร็จ: ${activityError.message}`
              : "สมัครสำเร็จแล้ว แต่บันทึกกิจกรรมไม่สำเร็จ",
            true,
          );
        }
        return;
      }

      if (authMode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
        });
        if (error) throw error;
        setPassword("");
        if (!data.session) {
          setAuthMode("verify_email");
          showMessage(
            `ส่งอีเมลยืนยันไปที่ ${email.trim()} แล้ว กรุณากดลิงก์ในอีเมล หรือกรอกรหัส 6 หลักด้านล่างหากอีเมลมีรหัส`,
          );
          return;
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
        setPassword("");
      }

      if (authMode === "signup" || authMode === "login") {
        try {
          await logActivity(authMode === "signup" ? "signup_success" : "login_success");
          showMessage(authMode === "signup" ? "สมัครสมาชิกสำเร็จ" : "เข้าสู่ระบบสำเร็จ");
        } catch (activityError) {
          showMessage(
            activityError instanceof Error
              ? `เข้าสู่ระบบแล้ว แต่บันทึกกิจกรรมไม่สำเร็จ: ${activityError.message}`
              : "เข้าสู่ระบบแล้ว แต่บันทึกกิจกรรมไม่สำเร็จ",
            true,
          );
        }
      }
    } catch (error) {
      const errorMessage = getAuthErrorMessage(error);
      showMessage(errorMessage, true);
      if (
        authMode === "login" &&
        error instanceof Error &&
        error.message.toLowerCase().includes("invalid login credentials")
      ) {
        setAuthErrorModal("อีเมลหรือรหัสผ่านไม่ถูกต้อง กรุณาตรวจสอบแล้วลองอีกครั้ง");
      }
    } finally {
      setBusy(false);
    }
  }

  async function resendConfirmationEmail() {
    setBusy(true);
    setMessage("");
    try {
      const { error } = await getSupabaseClient().auth.resend({
        type: "signup",
        email: email.trim(),
      });
      if (error) throw error;
      showMessage("ส่งอีเมลยืนยันอีกครั้งแล้ว กรุณาตรวจกล่องจดหมายและอีเมลขยะ");
    } catch (error) {
      showMessage(getAuthErrorMessage(error), true);
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    setBusy(true);
    try {
      try {
        await logActivity("logout");
      } catch (error) {
        showMessage(
          error instanceof Error
            ? `บันทึกการออกจากระบบไม่สำเร็จ: ${error.message}`
            : "บันทึกการออกจากระบบไม่สำเร็จ",
          true,
        );
      }

      const { error } = await getSupabaseClient().auth.signOut();
      if (error) throw error;
      setAdminOpen(false);
      setRole(null);
      setAdvisorUrl("");
    } catch (error) {
      showMessage(
        error instanceof Error ? error.message : "ออกจากระบบไม่สำเร็จ",
        true,
      );
    } finally {
      setBusy(false);
    }
  }

  async function openAdmin() {
    setAdminOpen(true);
    setAdminLoading(true);
    setMessage("");

    try {
      const supabase = getSupabaseClient();
      const [profileResult, activityResult] = await Promise.all([
        supabase.from("profiles").select("id,email,role").order("email"),
        supabase
          .from("activity_logs")
          .select("id,user_id,event_type,details,created_at")
          .order("created_at", { ascending: false })
          .limit(500),
      ]);

      if (profileResult.error) throw profileResult.error;
      if (activityResult.error) throw activityResult.error;
      setProfiles(profileResult.data as ProfileRow[]);
      setActivities(activityResult.data as ActivityRow[]);
    } catch (error) {
      showMessage(
        error instanceof Error
          ? `โหลดข้อมูลผู้ดูแลไม่สำเร็จ: ${error.message}`
          : "โหลดข้อมูลผู้ดูแลไม่สำเร็จ",
        true,
      );
    } finally {
      setAdminLoading(false);
    }
  }

  if (authLoading) {
    return <main className="auth-page"><p className="muted">กำลังตรวจสอบบัญชี...</p></main>;
  }

  if (!session || authMode === "reset_password") {
    const isSignup = authMode === "signup";
    const isForgotPassword = authMode === "forgot_password";
    const isResetPassword = authMode === "reset_password";
    const isVerifyingEmail = authMode === "verify_email";

    return (
      <main className="auth-page">
        <section className="auth-card">
          <div className="eyebrow">Horror Engine Advisor</div>
          <h1>
            {isVerifyingEmail
              ? "ยืนยันอีเมล"
              : isResetPassword
                ? "ตั้งรหัสผ่านใหม่"
                : isForgotPassword
                  ? "ลืมรหัสผ่าน"
                  : isSignup
                    ? "สร้างบัญชี"
                    : "เข้าสู่ระบบ"}
          </h1>
          {isVerifyingEmail ? (
            <>
              <p className="muted">
                เราส่งอีเมลไปที่ <strong>{email}</strong> แล้ว กดลิงก์ยืนยันในอีเมล
                หรือกรอกรหัส 6 หลักด้านล่าง หากอีเมลของคุณมีรหัส
              </p>
              <form className="auth-form" onSubmit={submitAuth}>
                <label>
                  รหัสยืนยัน 6 หลัก
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    value={verificationCode}
                    onChange={(event) => setVerificationCode(event.target.value)}
                    required
                  />
                </label>
                <button className="button-primary" type="submit" disabled={busy}>
                  {busy ? "กำลังยืนยัน..." : "ยืนยันอีเมล"}
                </button>
              </form>
              <button
                className="text-button"
                type="button"
                onClick={() => void resendConfirmationEmail()}
                disabled={busy}
              >
                ส่งอีเมลยืนยันอีกครั้ง
              </button>
              <button className="text-button" type="button" onClick={() => {
                setAuthMode("login");
                setMessage("");
              }}>
                กลับไปเข้าสู่ระบบ
              </button>
            </>
          ) : (
            <>
              <p className="muted">
                {isResetPassword
                  ? "ตั้งรหัสผ่านใหม่อย่างน้อย 8 ตัวอักษร"
                  : isForgotPassword
                    ? "กรอกอีเมลที่ใช้สมัคร เราจะส่งลิงก์ตั้งรหัสผ่านใหม่ให้"
                    : isSignup
                      ? "สร้างบัญชีด้วยอีเมลของคุณ แล้วตรวจอีเมลเพื่อยืนยันบัญชี"
                      : "กรอกอีเมลและรหัสผ่านที่ตั้งไว้ตอนสมัคร"}
              </p>
              <form className="auth-form" onSubmit={submitAuth}>
                {!isResetPassword && (
                  <label>
                    อีเมล
                    <input
                      type="email"
                      autoComplete="email"
                      required
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                    />
                  </label>
                )}
                {!isForgotPassword && (
                  <label>
                    {isResetPassword ? "รหัสผ่านใหม่" : "รหัสผ่าน"}
                    <span className="password-input-wrap">
                      <input
                        className="password-input"
                        type={passwordVisible ? "text" : "password"}
                        autoComplete={isSignup || isResetPassword ? "new-password" : "current-password"}
                        minLength={isSignup || isResetPassword ? 8 : undefined}
                        required
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                      />
                      <button
                        className="password-visibility"
                        type="button"
                        aria-label={passwordVisible ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}
                        aria-pressed={passwordVisible}
                        onClick={() => setPasswordVisible((visible) => !visible)}
                      >
                        {passwordVisible ? (
                          <svg viewBox="0 0 24 24" aria-hidden="true">
                            <path d="M3 3l18 18M10.6 10.6a2 2 0 002.8 2.8" />
                            <path d="M9.9 5.2A10.8 10.8 0 0112 5c5.5 0 9 7 9 7a15.7 15.7 0 01-3 3.8M6.2 6.2C3.9 7.8 3 12 3 12s3.5 7 9 7c1.4 0 2.6-.4 3.7-1" />
                          </svg>
                        ) : (
                          <svg viewBox="0 0 24 24" aria-hidden="true">
                            <path d="M3 12s3.5-7 9-7 9 7 9 7-3.5 7-9 7-9-7-9-7z" />
                            <circle cx="12" cy="12" r="3" />
                          </svg>
                        )}
                      </button>
                    </span>
                    {(isSignup || isResetPassword) && (
                      <span className="field-hint">อย่างน้อย 8 ตัวอักษร</span>
                    )}
                  </label>
                )}
                <button className="button-primary" type="submit" disabled={busy}>
                  {busy
                    ? "กำลังดำเนินการ..."
                    : isResetPassword
                      ? "บันทึกรหัสผ่านใหม่"
                      : isForgotPassword
                        ? "ส่งลิงก์ตั้งรหัสผ่าน"
                        : isSignup
                          ? "สมัครสมาชิก"
                          : "เข้าสู่ระบบ"}
                </button>
              </form>
              {authMode === "login" && (
                <button className="text-button" type="button" onClick={() => {
                  setAuthMode("forgot_password");
                  setMessage("");
                }}>
                  ลืมรหัสผ่าน?
                </button>
              )}
              {authMode === "login" || authMode === "signup" ? (
                <button className="text-button" type="button" onClick={() => {
                  setAuthMode(isSignup ? "login" : "signup");
                  setMessage("");
                }}>
                  {isSignup ? "มีบัญชีแล้ว? เข้าสู่ระบบ" : "ยังไม่มีบัญชี? สมัครสมาชิก"}
                </button>
              ) : (
                <button className="text-button" type="button" onClick={() => {
                  setAuthMode("login");
                  setMessage("");
                }}>
                  กลับไปเข้าสู่ระบบ
                </button>
              )}
              {(authMode === "login" || isSignup) && (
                <div className="auth-help">
                  <strong>วิธีใช้บัญชีผู้ดูแล</strong>
                  <p>
                    ไม่มีรหัสผ่านกลาง ให้สมัครด้วยอีเมลผู้ดูแล แล้วตั้งรหัสผ่านเอง
                    จากนั้นยืนยันอีเมลก่อนเข้าสู่ระบบ
                  </p>
                  <ul>
                    <li>thanaphatsandee@gmail.com</li>
                  </ul>
                  <p>ถ้ามีบัญชีแล้วแต่จำรหัสไม่ได้ ให้ใช้ “ลืมรหัสผ่าน?”</p>
                </div>
              )}
            </>
          )}
          <p className="notice">
            เพื่อให้ผู้ดูแลตรวจสอบการใช้งาน ระบบจะบันทึกเวลาเข้าสู่/ออกจากระบบ
            คำตอบที่เลือก และผลแนะนำ ข้อความอิสระที่พิมพ์ในช่อง AI
            จะไม่ถูกบันทึก
          </p>
          {message && (
            <p className={`message ${messageIsError ? "error" : "success"}`} role="status">
              {message}
            </p>
          )}
          {authErrorModal && (
            <div className="auth-modal-backdrop" role="presentation">
              <section
                className="auth-error-modal"
                role="alertdialog"
                aria-modal="true"
                aria-labelledby="auth-error-title"
                aria-describedby="auth-error-description"
              >
                <div className="auth-error-icon" aria-hidden="true">!</div>
                <h2 id="auth-error-title">เข้าสู่ระบบไม่สำเร็จ</h2>
                <p id="auth-error-description">{authErrorModal}</p>
                <button
                  className="button-primary"
                  type="button"
                  autoFocus
                  onClick={() => setAuthErrorModal("")}
                >
                  ตกลง
                </button>
              </section>
            </div>
          )}
        </section>
      </main>
    );
  }

  return (
    <main className="app-page">
      <nav className="app-toolbar" aria-label="บัญชีผู้ใช้">
        <span>{session.user.email}</span>
        {role === "admin" && (
          <button className="button-secondary" type="button" onClick={() => void openAdmin()}>
            ข้อมูลผู้ใช้
          </button>
        )}
        <button className="button-secondary" type="button" onClick={() => void signOut()} disabled={busy}>
          ออกจากระบบ
        </button>
      </nav>
      {advisorUrl ? (
        <iframe
          ref={iframeRef}
          className="advisor-frame"
          title="Horror Engine Advisor"
          src={advisorUrl}
        />
      ) : (
        <div className="auth-page">
          <p className="muted">กำลังโหลดเครื่องมือ...</p>
        </div>
      )}
      {message && (
        <div className={`message ${messageIsError ? "error" : "success"}`} role="status">
          {message}
        </div>
      )}
      {adminOpen && (
        <div className="admin-overlay" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setAdminOpen(false);
        }}>
          <section className="admin-panel" role="dialog" aria-modal="true" aria-labelledby="admin-title">
            <div className="admin-heading">
              <div>
                <div className="eyebrow">Admin</div>
                <h1 id="admin-title">ประวัติการใช้งาน</h1>
                <p className="muted">แสดงกิจกรรมล่าสุดไม่เกิน 500 รายการ</p>
              </div>
              <button className="button-secondary" type="button" onClick={() => setAdminOpen(false)}>
                ปิด
              </button>
            </div>
            {adminLoading ? (
              <p className="muted">กำลังโหลดข้อมูล...</p>
            ) : (
              <>
                <div className="admin-table-wrap">
                  <table className="admin-table">
                    <thead>
                      <tr><th>บัญชีผู้ใช้</th><th>สิทธิ์</th></tr>
                    </thead>
                    <tbody>
                      {profiles.map((profile) => (
                        <tr key={profile.id}>
                          <td>{profile.email}</td>
                          <td>{profile.role === "admin" ? "ผู้ดูแล" : "ผู้ใช้"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="admin-table-wrap">
                  <table className="admin-table">
                    <thead>
                      <tr><th>วันเวลา</th><th>บัญชี</th><th>กิจกรรม</th><th>รายละเอียด</th></tr>
                    </thead>
                    <tbody>
                      {activities.map((activity) => {
                        const profile = profiles.find((row) => row.id === activity.user_id);
                        return (
                          <tr key={activity.id}>
                            <td>{new Date(activity.created_at).toLocaleString("th-TH")}</td>
                            <td>{profile?.email ?? "ไม่พบอีเมล"}</td>
                            <td>{formatEvent(activity.event_type)}</td>
                            <td>{formatDetails(activity)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {activities.length === 0 && (
                    <p className="muted admin-empty">ยังไม่มีประวัติการใช้งาน</p>
                  )}
                </div>
              </>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
