import { OnPluginChange } from "@/src/Core/PluginChangeBus";

type RouteContext = {
  params: Promise<{ botId: string; guildId: string }>;
};

async function Get(Request: Request, Context: RouteContext): Promise<Response> {
  const { botId, guildId } = await Context.params;
  const Encoder = new TextEncoder();
  const { readable, writable } = new TransformStream();
  const Writer = writable.getWriter();

  const Write = (Data: string): void => {
    void Writer.write(Encoder.encode(Data));
  };

  Write("retry: 2000\n");
  Write("data: connected\n\n");

  const KeepaliveId = setInterval(() => {
    Write(": keepalive\n\n");
  }, 30_000);

  const Unsubscribe = OnPluginChange(botId, guildId, () => {
    Write("data: updated\n\n");
  });

  Request.signal.addEventListener("abort", () => {
    clearInterval(KeepaliveId);
    Unsubscribe();
    void Writer.close();
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive"
    }
  });
}

export { Get as GET };
