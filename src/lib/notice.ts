export type NoticeType = "success" | "error" | "info";

export type Notice = {
  type: NoticeType;
  message: string;
};

type SearchParamValue = string | string[] | undefined;
type SearchParamRecord = Record<string, SearchParamValue>;

function firstValue(value: SearchParamValue): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export async function readNotice(
  searchParams?: Promise<SearchParamRecord>,
): Promise<Notice | null> {
  if (!searchParams) {
    return null;
  }

  const params = await searchParams;
  const type = firstValue(params.notice);
  const message = firstValue(params.message);

  if (!type || !message) {
    return null;
  }

  if (type !== "success" && type !== "error" && type !== "info") {
    return null;
  }

  return {
    type,
    message,
  };
}

export function buildNoticeHref(
  redirectTo: string,
  type: NoticeType,
  message: string,
) {
  const target = redirectTo.startsWith("/") ? redirectTo : "/";
  const params = new URLSearchParams({
    notice: type,
    message,
  });

  return `${target}?${params.toString()}`;
}
