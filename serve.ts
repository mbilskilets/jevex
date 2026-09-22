import index from "./web/index.html";

const convex = process.env.CONVEX_URL ?? "http://127.0.0.1:3210";

type Pipe = { target: string; upstream?: WebSocket; backlog: (string | Buffer)[] };

const server = Bun.serve({
  port: Number(process.env.PORT ?? 4321),
  hostname: "0.0.0.0",
  routes: { "/": index },
  development: { hmr: true, console: true },

  async fetch(request, server) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) return new Response("Not found", { status: 404 });

    const target = `${convex}${url.pathname}${url.search}`;
    if (request.headers.get("upgrade")?.toLowerCase() === "websocket") {
      const data: Pipe = { target: target.replace(/^http/, "ws"), backlog: [] };
      return server.upgrade(request, { data }) ? undefined : new Response("Upgrade failed", { status: 400 });
    }

    const headers = new Headers(request.headers);
    headers.delete("host");
    const response = await fetch(target, {
      method: request.method,
      headers,
      body: request.body,
      redirect: "manual",
    });
    const passthrough = new Headers(response.headers);
    passthrough.delete("content-encoding");
    passthrough.delete("content-length");
    return new Response(response.body, { status: response.status, headers: passthrough });
  },

  websocket: {
    data: {} as Pipe,
    open(client) {
      const upstream = new WebSocket(client.data.target);
      upstream.binaryType = "arraybuffer";
      client.data.upstream = upstream;
      upstream.onopen = () => {
        for (const message of client.data.backlog.splice(0)) upstream.send(message);
      };
      upstream.onmessage = ({ data }) => client.send(data);
      upstream.onclose = ({ code, reason }) => client.close(code === 1005 || code === 1006 ? 1000 : code, reason);
      upstream.onerror = () => client.close(1011, "Convex is unreachable");
    },
    message(client, message) {
      const { upstream } = client.data;
      if (upstream?.readyState === WebSocket.OPEN) upstream.send(message);
      else client.data.backlog.push(message);
    },
    close(client) {
      client.data.upstream?.close();
    },
  },
});

console.log(`jevex demo on ${server.url}`);
