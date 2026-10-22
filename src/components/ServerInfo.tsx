import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Server, AlertCircle, CheckCircle2 } from "lucide-react";

interface InfoPayload {
  name: string;
  description: string;
  seller: string;
  facilitator: string;
  endpoints: { path: string; method: string; price: string; description: string }[];
}

interface Props {
  onEndpoints: (endpoints: InfoPayload["endpoints"]) => void;
}

export function ServerInfo({ onEndpoints }: Props) {
  const [info, setInfo] = useState<InfoPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/info")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<InfoPayload>;
      })
      .then((data) => {
        setInfo(data);
        onEndpoints(data.endpoints);
      })
      .catch((e: Error) => {
        setError(e.message);
      });
  }, [onEndpoints]);

  const sellerConfigured =
    info && info.seller !== "not configured" && info.seller !== "0x0000000000000000000000000000000000000000";

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 20,
        padding: "20px 24px",
        marginBottom: 8,
      }}
    >
      <div className="flex items-center gap-3 mb-4">
        <div
          className="flex items-center justify-center w-10 h-10 rounded-2xl shrink-0"
          style={{ background: "rgba(172,198,233,0.15)", border: "1px solid var(--border)" }}
        >
          <Server className="w-5 h-5" style={{ color: "var(--accent)" }} />
        </div>
        <div>
          <h2 className="display font-semibold text-base" style={{ color: "var(--ink)" }}>
            支付服务器状态
          </h2>
          <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>
            Circle Gateway Nanopayments · Arc Testnet
          </p>
        </div>
        <div className="ml-auto">
          {error ? (
            <span className="flex items-center gap-1 text-xs" style={{ color: "var(--danger)" }}>
              <AlertCircle className="w-3.5 h-3.5" /> 离线
            </span>
          ) : info ? (
            <span className="flex items-center gap-1 text-xs font-medium" style={{ color: "var(--success)" }}>
              <CheckCircle2 className="w-3.5 h-3.5" /> 运行中
            </span>
          ) : (
            <span className="text-xs animate-pulse" style={{ color: "var(--muted)" }}>
              连接中...
            </span>
          )}
        </div>
      </div>

      {error && (
        <p className="text-sm rounded-xl px-3 py-2" style={{ background: "rgba(232,109,122,0.1)", color: "var(--danger)", border: "1px solid rgba(232,109,122,0.2)" }}>
          无法连接后端服务器: {error}
        </p>
      )}

      {info && (
        <div className="space-y-2">
          {/* Seller address */}
          <div className="flex items-center justify-between text-sm">
            <span style={{ color: "var(--muted)" }}>卖方地址</span>
            <div className="flex items-center gap-1.5">
              {sellerConfigured ? (
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" style={{ color: "var(--success)" }} />
              ) : (
                <AlertCircle className="w-3.5 h-3.5 shrink-0" style={{ color: "var(--danger)" }} />
              )}
              <span
                className="mono text-xs truncate max-w-[180px]"
                style={{ color: sellerConfigured ? "var(--ink-2)" : "var(--danger)" }}
              >
                {sellerConfigured ? info.seller : "未配置"}
              </span>
            </div>
          </div>

          {/* Facilitator */}
          <div className="flex items-center justify-between text-sm">
            <span style={{ color: "var(--muted)" }}>Gateway Facilitator</span>
            <span className="mono text-xs" style={{ color: "var(--ink-2)" }}>
              {info.facilitator.replace("https://", "").slice(0, 36)}
            </span>
          </div>
        </div>
      )}

      {/* Seller setup hint */}
      {info && !sellerConfigured && (
        <div
          className="mt-3 p-3 rounded-xl text-xs"
          style={{
            background: "rgba(172,198,233,0.08)",
            border: "1px solid rgba(172,198,233,0.2)",
            color: "var(--muted)",
          }}
        >
          在 <span className="mono">.env</span> 中设置{" "}
          <span className="mono" style={{ color: "var(--accent)" }}>
            VITE_SELLER_ADDRESS=0x你的地址
          </span>{" "}
          以接收真实的 USDC 支付。
        </div>
      )}
    </motion.div>
  );
}
