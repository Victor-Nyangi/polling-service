import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * `/p/<postId>?invite=<token>` carries a bearer credential in its URL, so
   * the permalink never sends a Referer: not to an external link, not to an
   * image host, not to another page here. Set for the route rather than only
   * when `?invite=` is present, so it also covers the page after the redirect
   * that strips the token, and costs nothing for a page with no outbound
   * links worth attributing.
   */
  async headers() {
    return [
      {
        source: "/p/:postId",
        headers: [{ key: "Referrer-Policy", value: "no-referrer" }],
      },
    ];
  },
  /**
   * The dev server logs every request's URL, and with it the Server Action
   * call made from that URL. An invite link's URL is the token, so requests
   * carrying one are left out. Production (`next start`) does not log
   * requests at all.
   */
  logging: {
    incomingRequests: {
      ignore: [/[?&]invite=/],
    },
  },
};

export default nextConfig;
