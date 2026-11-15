// Newline-delimited JSON-RPC 2.0 over a child process's stdio, used by the
// ACP and Codex app-server adapters.
export class JsonRpc {
  constructor(child, { onRequest, onNotification, onLog }) {
    this.child = child;
    this.seq = 0;
    this.waiting = new Map();
    this.closed = false;
    let buf = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      buf += chunk;
      let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (!line) continue;
        let msg;
        try {
          msg = JSON.parse(line);
        } catch {
          onLog?.(`non-JSON stdout: ${line.slice(0, 200)}`);
          continue;
        }
        this.#dispatch(msg, onRequest, onNotification);
      }
    });
    child.on("exit", () => {
      this.closed = true;
      for (const w of this.waiting.values()) w.reject(new Error("Agent process exited"));
      this.waiting.clear();
    });
  }

  async #dispatch(msg, onRequest, onNotification) {
    if (msg.method && msg.id !== undefined) {
      try {
        const result = await onRequest(msg.method, msg.params || {});
        this.#write({ jsonrpc: "2.0", id: msg.id, result: result ?? null });
      } catch (err) {
        this.#write({ jsonrpc: "2.0", id: msg.id, error: { code: err.code ?? -32603, message: err.message } });
      }
    } else if (msg.method) {
      onNotification(msg.method, msg.params || {});
    } else if (msg.id !== undefined) {
      const w = this.waiting.get(msg.id);
      if (!w) return;
      this.waiting.delete(msg.id);
      if (msg.error) {
        const err = new Error(msg.error.message || "Agent error");
        err.code = msg.error.code;
        err.data = msg.error.data;
        w.reject(err);
      } else w.resolve(msg.result);
    }
  }

  #write(obj) {
    if (!this.closed && this.child.stdin.writable) this.child.stdin.write(JSON.stringify(obj) + "\n");
  }

  request(method, params) {
    if (this.closed) return Promise.reject(new Error("Agent process exited"));
    const id = ++this.seq;
    return new Promise((resolve, reject) => {
      this.waiting.set(id, { resolve, reject });
      this.#write({ jsonrpc: "2.0", id, method, params });
    });
  }

  notify(method, params) {
    this.#write({ jsonrpc: "2.0", method, params });
  }
}

export function methodNotFound(method) {
  const err = new Error(`Method not supported: ${method}`);
  err.code = -32601;
  return err;
}
