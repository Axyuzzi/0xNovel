import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

const sections = [
  {
    title: "保存在这台电脑上的内容",
    body: "作品、章节草稿、候选稿、版本、故事规划和本地备份保存在当前电脑，并按登录账号隔离。退出登录或换账号不会自动删除这些内容。",
  },
  {
    title: "发送到创作服务的内容",
    body: "当你主动确认 AI 生成、修改或检查时，完成该任务所需的故事规划、相关章节和操作说明会发送到自有中转站，再由中转站调用模型。普通编辑、保存、采用候选稿和恢复本地版本不会发送新的模型请求。",
  },
  {
    title: "账户、充值与消费",
    body: "账号资料、登录凭证、积分余额、充值订单和消费记录由中转站处理。软件本机不保存你的登录密码；保持登录只使用系统加密能力保存登录凭证，不保存密码。",
  },
  {
    title: "日志与诊断",
    body: "正式版不接入第三方分析、崩溃自动上报或远程日志。软件只在本机保留受限诊断日志，并对密码、登录凭证、支付凭据等敏感内容进行脱敏；C 端模式不记录完整写作指令或正文响应。",
  },
  {
    title: "备份、恢复与删除",
    body: "你可以在“我的”中创建或导出当前账号的本地备份。选择删除本机作品时，只删除当前账号在这台电脑上的资料，并移入系统回收站；账号、积分和中转记录不会随之删除。",
  },
] as const;

export default function ConsumerPrivacyPage() {
  return (
    <article className="mx-auto w-full max-w-3xl pb-12">
      <header className="border-b border-slate-200 pb-8">
        <p className="text-sm font-medium text-slate-600">隐私与本地数据说明</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.03em] text-slate-950">
          你的作品保存在哪里
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          更新日期：2026 年 7 月 28 日。本页面说明当前桌面产品的数据边界；正式收费发布前仍需由实际运营主体完成法律文本、联系方式和账号注销流程。
        </p>
      </header>

      <div className="divide-y divide-slate-200">
        {sections.map((section) => (
          <section key={section.title} className="py-7">
            <h2 className="text-lg font-semibold text-slate-950">{section.title}</h2>
            <p className="mt-3 text-sm leading-7 text-slate-700">{section.body}</p>
          </section>
        ))}
      </div>

      <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-950">
        删除本机作品不等于注销中转账号。中转站尚未冻结正式账号注销接口前，收费公开发布保持阻断状态。
      </div>

      <div className="mt-8 flex flex-wrap gap-3">
        <Button asChild>
          <Link to="/account">管理本地数据</Link>
        </Button>
        <Button asChild variant="outline">
          <Link to="/help">查看使用帮助</Link>
        </Button>
      </div>
    </article>
  );
}
