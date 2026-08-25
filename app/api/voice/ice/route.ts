import { env } from "cloudflare:workers";

const STUN_ONLY: RTCIceServer[] = [
  { urls: ["stun:stun.cloudflare.com:3478"] },
];

export async function GET() {
  const runtimeEnv = env as unknown as Record<string, string | undefined>;
  const keyId = runtimeEnv.CF_TURN_KEY_ID;
  const apiToken = runtimeEnv.CF_TURN_API_TOKEN;

  if (!keyId || !apiToken) {
    return Response.json({ iceServers: STUN_ONLY, relayConfigured: false });
  }

  try {
    const response = await fetch(
      `https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(keyId)}/credentials/generate-ice-servers`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ ttl: 7200 }),
      },
    );
    if (!response.ok) throw new Error(`TURN ${response.status}`);
    const data = (await response.json()) as { iceServers?: RTCIceServer[] };
    const iceServers = (data.iceServers ?? STUN_ONLY).map((server) => ({
      ...server,
      urls: (Array.isArray(server.urls) ? server.urls : [server.urls]).filter(
        (url): url is string => typeof url === "string" && !url.includes(":53"),
      ),
    })).filter((server) => Array.isArray(server.urls) && server.urls.length > 0);
    return Response.json({ iceServers, relayConfigured: true });
  } catch {
    return Response.json({ iceServers: STUN_ONLY, relayConfigured: false });
  }
}
