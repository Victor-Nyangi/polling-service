import type { Notice } from "@/lib/notice";

const noticeStyles = {
  success: "border-emerald-200 bg-emerald-50 text-emerald-900",
  error: "border-rose-200 bg-rose-50 text-rose-900",
  info: "border-violet-200 bg-violet-50 text-violet-900",
};

export function NoticeBanner({ notice }: { notice: Notice | null }) {
  if (!notice) {
    return null;
  }

  return (
    <div
      className={`rounded-2xl border px-4 py-3 text-sm ${noticeStyles[notice.type]}`}
    >
      {notice.message}
    </div>
  );
}
