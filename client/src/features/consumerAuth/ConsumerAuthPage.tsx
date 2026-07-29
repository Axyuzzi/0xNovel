import { useState, type FormEvent } from "react";
import {
  Check,
  Eye,
  EyeOff,
  LoaderCircle,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import DesktopBrandMark from "@/components/layout/DesktopBrandMark";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useConsumerSession } from "./ConsumerSessionContext";
import { useOnlineStatus } from "@/features/network/onlineStatus";

type AuthMode = "login" | "register";

interface AuthFormState {
  username: string;
  password: string;
  confirmPassword: string;
}

const INITIAL_FORM: AuthFormState = {
  username: "",
  password: "",
  confirmPassword: "",
};

function Field(props: {
  id: keyof AuthFormState;
  label: string;
  value: string;
  type?: string;
  autoComplete?: string;
  placeholder?: string;
  onChange: (value: string) => void;
  trailing?: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <label htmlFor={props.id} className="text-sm font-medium text-slate-800">
        {props.label}
      </label>
      <div className="relative">
        <Input
          id={props.id}
          type={props.type}
          value={props.value}
          autoComplete={props.autoComplete}
          placeholder={props.placeholder}
          className="h-11 border-slate-300 bg-white pr-11 text-slate-950 placeholder:text-slate-500 focus-visible:ring-slate-900"
          onChange={(event) => props.onChange(event.target.value)}
        />
        {props.trailing}
      </div>
    </div>
  );
}

export default function ConsumerAuthPage() {
  const { login, register } = useConsumerSession();
  const online = useOnlineStatus();
  const [mode, setMode] = useState<AuthMode>("login");
  const [form, setForm] = useState<AuthFormState>(INITIAL_FORM);
  const [keepSignedIn, setKeepSignedIn] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const update = (field: keyof AuthFormState, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    setError("");
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    if (mode === "register" && form.password !== form.confirmPassword) {
      setError("两次输入的密码不一致。");
      return;
    }

    setSubmitting(true);
    try {
      if (mode === "login") {
        await login({
          username: form.username,
          password: form.password,
        }, keepSignedIn);
      } else {
        await register({
          username: form.username,
          password: form.password,
        }, keepSignedIn);
      }
    } catch (submitError) {
      setError(
        submitError instanceof Error && submitError.message.trim()
          ? submitError.message
          : mode === "login"
            ? "登录失败，请检查账号和密码。"
            : "注册失败，请检查填写内容。",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <div className="mx-auto grid min-h-screen max-w-[1480px] lg:grid-cols-[minmax(360px,0.9fr)_minmax(520px,1.1fr)]">
        <section className="hidden bg-slate-950 px-12 py-14 text-white lg:flex lg:flex-col">
          <div className="flex items-center gap-3 text-sm font-semibold">
            <DesktopBrandMark className="size-10 rounded-lg drop-shadow-none" />
            0xNovelAgent
          </div>

          <div className="my-auto max-w-lg py-16">
            <p className="text-sm font-medium text-sky-300">你的故事，保存在你的电脑里</p>
            <h1 className="mt-5 text-4xl font-semibold leading-tight tracking-[-0.03em] text-balance">
              从一个想法开始，安心写完一本小说
            </h1>
            <p className="mt-6 max-w-[58ch] text-base leading-8 text-slate-300 text-pretty">
              你只需要决定故事方向、阅读章节并确认下一步。规划、整理和连续性维护由系统在后台完成。
            </p>

            <ul className="mt-10 space-y-4 text-sm text-slate-200">
              {[
                "作品、草稿和版本保存在本机",
                "每次付费创作前都能看到预计积分",
                "无需设置模型，也不用学习专业术语",
              ].map((item) => (
                <li key={item} className="flex items-center gap-3">
                  <span className="grid size-6 place-items-center rounded-full bg-sky-300 text-slate-950">
                    <Check className="size-3.5" strokeWidth={3} aria-hidden="true" />
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <p className="text-xs leading-5 text-slate-400">
            登录只用于创作服务、余额和充值。正文不会自动上传到账号云端。
          </p>
        </section>

        <section className="flex items-center justify-center px-6 py-10 sm:px-10 lg:px-16">
          <div className="w-full max-w-[440px]">
            <div className="mb-9 flex items-center gap-3 lg:hidden">
              <DesktopBrandMark className="size-10 rounded-lg drop-shadow-none" />
              <span className="font-semibold">0xNovelAgent</span>
            </div>

            <h2 className="text-2xl font-semibold tracking-[-0.02em]">
              {mode === "login" ? "继续你的故事" : "创建创作账号"}
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              {mode === "login"
                ? "登录后会打开此账号在本机保存的作品。"
                : "注册成功后直接进入产品，不需要再次登录。"}
            </p>
            {!online ? (
              <div role="status" className="mt-5 rounded-lg bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950">
                当前未联网，暂时不能登录或注册。已有登录状态会在下次启动时安全恢复。
              </div>
            ) : null}

            <Tabs
              value={mode}
              onValueChange={(value) => {
                setMode(value as AuthMode);
                setError("");
              }}
              className="mt-8"
            >
              <TabsList className="grid w-full grid-cols-2 bg-slate-200/70">
                <TabsTrigger value="login">登录</TabsTrigger>
                <TabsTrigger value="register">注册</TabsTrigger>
              </TabsList>
            </Tabs>

            <form className="mt-7 space-y-5" onSubmit={(event) => void submit(event)}>
              <Field
                id="username"
                label={mode === "login" ? "账号或邮箱" : "账号"}
                value={form.username}
                autoComplete="username"
                placeholder={mode === "login" ? "输入账号或邮箱" : "设置一个好记的账号"}
                onChange={(value) => update("username", value)}
              />

              <Field
                id="password"
                label="密码"
                value={form.password}
                type={showPassword ? "text" : "password"}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                placeholder={mode === "register" ? "至少 8 个字符" : "输入密码"}
                onChange={(value) => update("password", value)}
                trailing={(
                  <button
                    type="button"
                    className="absolute right-1.5 top-1.5 grid size-8 place-items-center rounded-md text-slate-600 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
                    onClick={() => setShowPassword((current) => !current)}
                    aria-label={showPassword ? "隐藏密码" : "显示密码"}
                  >
                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                )}
              />

              {mode === "register" ? (
                <Field
                  id="confirmPassword"
                  label="再次输入密码"
                  value={form.confirmPassword}
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  placeholder="再次输入密码"
                  onChange={(value) => update("confirmPassword", value)}
                />
              ) : null}

              <label className="flex cursor-pointer items-start gap-3 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={keepSignedIn}
                  className="mt-0.5 size-4 rounded border-slate-400 accent-slate-950"
                  onChange={(event) => setKeepSignedIn(event.target.checked)}
                />
                <span>
                  <span className="font-medium text-slate-900">保持登录</span>
                  <span className="mt-0.5 block text-xs leading-5 text-slate-600">
                    使用 Windows 加密保存登录状态，不保存你的密码。
                  </span>
                </span>
              </label>

              {error ? (
                <div
                  role="alert"
                  className="rounded-lg bg-red-50 px-4 py-3 text-sm leading-6 text-red-800"
                >
                  {error}
                </div>
              ) : null}

              <Button
                type="submit"
                size="lg"
                className="h-11 w-full bg-slate-950 text-white hover:bg-slate-800"
                disabled={submitting || !online}
              >
                {submitting ? <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" /> : null}
                {submitting
                  ? mode === "login" ? "正在登录" : "正在创建账号"
                  : mode === "login" ? "登录并继续" : "创建账号并开始"}
              </Button>
            </form>

            <div className="mt-7 flex items-start gap-2 text-xs leading-5 text-slate-600">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-slate-700" aria-hidden="true" />
              账号信息只用于登录请求，不会写入作品文件或运行日志。
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
