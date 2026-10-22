import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, CheckCircle2, XCircle, Zap } from "lucide-react";

interface Endpoint {
  path: string;
  method: string;
  price: string;
  description: string;
}

interface ApiResult {
  [key: string]: unknown;
}

interface Props {
  endpoint: Endpoint;
  index: number;
}

function StatusBadge({ status }: { status: "idle" | "loading" | "success" | "error" }) {
  if (status === "idle") return null;
  if (status === "loading")
    return (
      <span className="flex items-center gap-1 text-xs font-medium" style={{ color: "var(--muted)" }}>
        <Loader2 className="w-3 h-3 animate-spin" /> 处理中...
      </span>
    );
  if (status === "success")
    return (
      <span className="flex items-center gap-1 text-xs font-medium" style={{ color: "var(--success)" }}>
        <CheckCircle2 className="w-3 h-3" /> 支付成功
      </span>
    );
  return (
    <span className="flex items-center gap-1 text-xs font-medium" style={{ color: "var(--danger)" }}>
      <XCircle className="w-3 h-3" /> 失败
    </span>
  );
}

export function ApiEndpointCard({ endpoint, index }: Props) {
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [result, setResult] = useState<ApiResult | null>(null);
  const [rawError, setRawError] = useState<string | null>(null);

  async function testCall() {
    setStatus("loading");
    setResult(null);
    setRawError(null);

    let body: Record<string, unknown> = {};
    if (endpoint.path.includes("summarize")) body = { text: "Circle Gateway enables gasless USDC nanopayments down to $0.000001 for AI agents." };
    if (endpoint.path.includes("translate")) body = { text: "Hello, world!", target_lang: "ZH" };
    if (endpoint.path.includes("analyze")) body = { data: [1, 2, 3, 4, 5] };

    try {
      const res = await fetch(`/api${endpoint.path}`, {
        method: endpoint.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.status === 402) {
        const txt = await res.text();
        setStatus("error");
        setRawError(`402 Payment Required — 买方 agent 需要先存入 USDC 到 Gateway Wallet 才能调用此接口。\n\n${txt.slice(0, 300)}`);
        return;
      }

      const json = await res.json() as ApiResult;
      setResult(json);
      setStatus("success");
    } catch (e) {
      setStatus("error");
      setRawError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.08, duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 16,
        padding: "20px 20px 16px",
      }}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span
              className="mono text-xs px-2 py-0.5 rounded-md font-semibold"
              style={{
                background: "rgba(172,198,233,0.15)",
                color: "var(--accent)",
                border: "1px solid var(--border)",
              }}
            >
              {endpoint.method}
            </span>
            <span className="mono text-sm" style={{ color: "var(--ink-2)" }}>
              {endpoint.path}
            </span>
          </div>
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            {endpoint.description}
          </p>
        </div>

        <div
          className="flex items-center gap-1 shrink-0 px-2.5 py-1 rounded-lg"
          style={{
            background: "rgba(141,216,159,0.12)",
            border: "1px solid rgba(141,216,159,0.3)",
          }}
        >
          <Zap className="w-3 h-3" style={{ color: "var(--success)" }} />
          <span className="display text-sm font-semibold tabular-nums" style={{ color: "var(--success)" }}>
            {endpoint.price}
          </span>
        </div>
      </div>

      {/* Action row */}
      <div className="flex items-center justify-between gap-3">
        <StatusBadge status={status} />
        <button
          onClick={() => { void testCall() }}
          disabled={status === "loading"}
          className="px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
          style={{
            background: status === "loading" ? "var(--surface-muted)" : "var(--accent)",
            color: "#0d1b2f",
            border: "none",
            cursor: status === "loading" ? "not-allowed" : "pointer",
            minWidth: 80,
            minHeight: 36,
          }}
          onMouseEnter={(e) => {
            if (status !== "loading") (e.currentTarget).style.background = "var(--accent-hover)";
          }}
          onMouseLeave={(e) => {
            if (status !== "loading") (e.currentTarget).style.background = "var(--accent)";
          }}
        >
          {status === "loading" ? "调用中..." : "测试调用"}
        </button>
      </div>

      {/* Result */}
      <AnimatePresence>
        {(result || rawError) && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div
              className="mt-3 p-3 rounded-xl mono text-xs overflow-auto"
              style={{
                background: "var(--surface-muted)",
                color: rawError ? "var(--danger)" : "var(--ink-2)",
                border: "1px solid var(--border)",
                maxHeight: 180,
                whiteSpace: "pre-wrap",
                wordBreak: "break-all",
              }}
            >
              {rawError ?? JSON.stringify(result, null, 2)}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
