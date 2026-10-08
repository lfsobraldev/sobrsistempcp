"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Andon, Programacao, Sessao } from "@/types/pcp";

type Toast = {
  id: number;
  type: "success" | "error" | "info";
  text: string;
};

type RealtimeStatus =
  | "conectando"
  | "tempo_real"
  | "reconectando"
  | "indisponivel";

type Ctx = {
  me: Sessao | null;
  pg: Programacao | null;
  andon: Andon[];
  lastSync: Date | null;
  loading: boolean;
  realtimeStatus: RealtimeStatus;
  refresh: () => Promise<void>;
  toast: (type: Toast["type"], text: string) => void;
};

const C = createContext<Ctx | null>(null);
const CHANNEL = "sobral-pcp-live";

export function OperationalProvider({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<Sessao | null>(null);
  const [pg, setPg] = useState<Programacao | null>(null);
  const [andon, setAndon] = useState<Andon[]>([]);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [loading, setLoading] = useState(true);
  const [realtimeStatus, setRealtimeStatus] =
    useState<RealtimeStatus>("conectando");
  const [toasts, setToasts] = useState<Toast[]>([]);
  const mounted = useRef(true);
  const refreshing = useRef(false);
  const pendingRefresh = useRef(false);
  const realtimeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadSession = useCallback(async () => {
    const r = await fetch("/api/me", { cache: "no-store" });
    if (r.ok && mounted.current) setMe(await r.json());
  }, []);

  const refresh = useCallback(async () => {
    if (refreshing.current) {
      pendingRefresh.current = true;
      return;
    }

    refreshing.current = true;
    try {
      const [a, c] = await Promise.all([
        fetch("/api/programacoes/ativa", { cache: "no-store" }),
        fetch("/api/andon", { cache: "no-store" }),
      ]);

      if (a.ok && mounted.current) setPg((await a.json()).programacao);
      if (c.ok && mounted.current) setAndon((await c.json()).itens || []);
      if (mounted.current) setLastSync(new Date());
    } finally {
      refreshing.current = false;
      if (pendingRefresh.current && mounted.current) {
        pendingRefresh.current = false;
        queueMicrotask(() => {
          void refresh();
        });
      }
    }
  }, []);

  const scheduleRefresh = useCallback(() => {
    if (realtimeTimer.current) clearTimeout(realtimeTimer.current);
    realtimeTimer.current = setTimeout(() => {
      realtimeTimer.current = null;
      void refresh();
    }, 180);
  }, [refresh]);

  useEffect(() => {
    mounted.current = true;

    void (async () => {
      await loadSession();
      await refresh();
      if (mounted.current) setLoading(false);
    })();

    // Fallback de segurança: o realtime é o principal; esta atualização é só
    // para recuperar eventual evento perdido sem martelar o Neon.
    const fallback = setInterval(() => {
      void refresh();
    }, 60_000);

    return () => {
      mounted.current = false;
      clearInterval(fallback);
      if (realtimeTimer.current) clearTimeout(realtimeTimer.current);
    };
  }, [loadSession, refresh]);

  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_PUSHER_KEY?.trim();
    const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER?.trim();

    if (!key || !cluster) {
      setRealtimeStatus("indisponivel");
      return;
    }

    let socket: WebSocket | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;

    const connect = () => {
      if (stopped) return;

      setRealtimeStatus((s) =>
        s === "tempo_real" ? "tempo_real" : "conectando"
      );

      socket = new WebSocket(
        `wss://ws-${cluster}.pusher.com/app/${key}?protocol=7&client=js&version=8.4.0&flash=false`
      );

      socket.onopen = () => {
        if (!stopped) setRealtimeStatus("conectando");
      };

      socket.onmessage = (message) => {
        try {
          const packet = JSON.parse(String(message.data || "{}"));

          if (packet.event === "pusher:connection_established") {
            socket?.send(
              JSON.stringify({
                event: "pusher:subscribe",
                data: { channel: CHANNEL },
              })
            );
            return;
          }

          if (packet.event === "pusher:subscription_succeeded") {
            setRealtimeStatus("tempo_real");
            return;
          }

          if (packet.event === "pusher:ping") {
            socket?.send(JSON.stringify({ event: "pusher:pong", data: {} }));
            return;
          }

          if (
            packet.event === "pcp:atualizacao" &&
            packet.channel === CHANNEL
          ) {
            scheduleRefresh();
          }
        } catch {
          // Pacote inválido não deve afetar a operação.
        }
      };

      socket.onerror = () => {
        if (!stopped) setRealtimeStatus("reconectando");
      };

      socket.onclose = () => {
        if (stopped) return;
        setRealtimeStatus("reconectando");
        retry = setTimeout(connect, 3000);
      };
    };

    connect();

    return () => {
      stopped = true;
      if (retry) clearTimeout(retry);
      socket?.close();
    };
  }, [scheduleRefresh]);

  const toast = useCallback(
    (type: Toast["type"], text: string) => {
      const id = Date.now() + Math.random();
      setToasts((t) => [...t, { id, type, text }]);
      setTimeout(
        () => setToasts((t) => t.filter((x) => x.id !== id)),
        3500
      );
    },
    []
  );

  const value = useMemo(
    () => ({
      me,
      pg,
      andon,
      lastSync,
      loading,
      realtimeStatus,
      refresh,
      toast,
    }),
    [
      me,
      pg,
      andon,
      lastSync,
      loading,
      realtimeStatus,
      refresh,
      toast,
    ]
  );

  return (
    <C.Provider value={value}>
      {children}
      <div className="toastStack">
        {toasts.map((t) => (
          <div className={`toast ${t.type}`} key={t.id}>
            {t.text}
          </div>
        ))}
      </div>
    </C.Provider>
  );
}

export function useOps() {
  const v = useContext(C);
  if (!v) throw new Error("useOps fora do provider");
  return v;
}
