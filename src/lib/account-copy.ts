import type { LanguageCode } from "@/lib/languages";

const en = {
  google: "Continue with Google", emailLogin: "Or use email and password", forgot: "Forgot password?",
  title: "Reset your password", email: "Email", send: "Send reset link",
  hint: "Enter your account email to receive a password reset link.",
  sent: "If this email has an account, a reset link will arrive shortly. Check your spam folder too.",
  sendError: "Could not send the reset link. Please try again shortly.",
  expired: "This link is invalid or expired. Request a new reset link below.",
  password: "New password", confirm: "Confirm new password", save: "Save new password",
  passwordHint: "Use at least 6 characters.", mismatch: "The passwords do not match.",
  short: "Use at least 6 characters for your password.",
  updateError: "Could not save your password. Try again, or request a new reset link.",
  done: "Password updated. You can return to creating your quiz.", back: "Back to creating a quiz",
  loading: "Checking your session…", working: "Working…", requestAgain: "Request a new reset link",
  googleError: "Google sign-in failed. Please try again.",
};

type AccountCopy = typeof en;
const copy: Partial<Record<LanguageCode, AccountCopy>> = {
  en,
  "zh-TW": {
    google: "使用 Google 登入", emailLogin: "或使用 Email 與密碼", forgot: "忘記密碼？",
    title: "重設密碼", email: "Email", send: "寄送重設連結",
    hint: "輸入帳號的 Email，我們會寄送密碼重設連結。",
    sent: "若此 Email 已註冊，你將收到重設連結，也請檢查垃圾郵件。",
    sendError: "重設連結寄送失敗，請稍後再試。", expired: "重設連結已失效或過期，請在下方重新申請。",
    password: "新密碼", confirm: "再次輸入新密碼", save: "儲存新密碼", passwordHint: "密碼至少需要 6 個字元。",
    mismatch: "兩次輸入的密碼不一致。", short: "密碼至少需要 6 個字元。",
    updateError: "密碼儲存失敗，請重試，或重新申請重設連結。",
    done: "密碼已更新，可以返回繼續出題。", back: "返回出題", loading: "正在確認登入狀態…",
    working: "處理中…", requestAgain: "重新申請重設連結", googleError: "Google 登入失敗，請再試一次。",
  },
  "zh-CN": {
    google: "使用 Google 登录", emailLogin: "或使用 Email 和密码", forgot: "忘记密码？",
    title: "重置密码", email: "Email", send: "发送重置链接",
    hint: "输入账号的 Email，我们会发送密码重置链接。",
    sent: "若此 Email 已注册，你将收到重置链接，也请检查垃圾邮件。",
    sendError: "重置链接发送失败，请稍后重试。", expired: "重置链接已失效或过期，请在下方重新申请。",
    password: "新密码", confirm: "再次输入新密码", save: "保存新密码", passwordHint: "密码至少需要 6 个字符。",
    mismatch: "两次输入的密码不一致。", short: "密码至少需要 6 个字符。",
    updateError: "密码保存失败，请重试，或重新申请重置链接。",
    done: "密码已更新，可以返回继续出题。", back: "返回出题", loading: "正在确认登录状态…",
    working: "处理中…", requestAgain: "重新申请重置链接", googleError: "Google 登录失败，请重试。",
  },
  ar: {
    google: "المتابعة باستخدام Google", emailLogin: "أو استخدم البريد الإلكتروني وكلمة المرور", forgot: "نسيت كلمة المرور؟",
    title: "إعادة تعيين كلمة المرور", email: "البريد الإلكتروني", send: "إرسال رابط إعادة التعيين",
    hint: "أدخل بريد حسابك الإلكتروني لتلقي رابط إعادة تعيين كلمة المرور.",
    sent: "إذا كان هذا البريد مسجلاً، فسيصلك رابط قريبًا. تحقق أيضًا من البريد غير المرغوب فيه.",
    sendError: "تعذر إرسال الرابط. حاول مجددًا لاحقًا.", expired: "الرابط غير صالح أو انتهت صلاحيته. اطلب رابطًا جديدًا أدناه.",
    password: "كلمة المرور الجديدة", confirm: "تأكيد كلمة المرور الجديدة", save: "حفظ كلمة المرور",
    passwordHint: "استخدم 6 أحرف على الأقل.", mismatch: "كلمتا المرور غير متطابقتين.", short: "استخدم 6 أحرف على الأقل.",
    updateError: "تعذر حفظ كلمة المرور. حاول مجددًا أو اطلب رابطًا جديدًا.",
    done: "تم تحديث كلمة المرور. يمكنك العودة لإنشاء سؤال.", back: "العودة لإنشاء سؤال", loading: "جارٍ التحقق من الجلسة…",
    working: "جارٍ المعالجة…", requestAgain: "طلب رابط جديد", googleError: "تعذر تسجيل الدخول باستخدام Google. حاول مجددًا.",
  },
};

export function accountCopyFor(language: LanguageCode) {
  return { text: copy[language] ?? en, lang: copy[language] ? language : "en" };
}
