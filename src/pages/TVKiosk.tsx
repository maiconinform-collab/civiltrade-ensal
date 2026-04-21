import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { GraduationCap, MapPin, Clock, User, Mic, Radio, AlertTriangle } from "lucide-react";
import { useSettings } from "@/contexts/SettingsContext";
import { QRCodeSVG } from "qrcode.react";

type Ensalamento = {
  id: string;
  sala: string;
  bloco: string | null;
  turno: string;
  horario: string;
  professor: string | null;
  segunda: string | null;
  terca: string | null;
  quarta: string | null;
  quinta: string | null;
  sexta: string | null;
  sabado: string | null;
};

type Evento = {
  id: string; nome: string; responsavel: string | null;
  inicio: string; fim: string; local: string | null;
};

type Aviso = { id: string; texto: string; ativo: boolean; ordem: number };

const dayKey = (d: Date) => {
  const idx = d.getDay();
  if (idx === 0) return null;
  return ["", "segunda", "terca", "quarta", "quinta", "sexta", "sabado"][idx];
};

const parseHorario = (h: string) => {
  const m = h.match(/(\d{1,2}):?(\d{2})\s*[-–]\s*(\d{1,2}):?(\d{2})/);
  if (!m) return null;
  return {
    start: parseInt(m[1]) * 60 + parseInt(m[2]),
    end: parseInt(m[3]) * 60 + parseInt(m[4]),
  };
};

type Status = "now" | "next" | "scheduled" | "done";
const statusFor = (h: string, now: Date): Status => {
  const p = parseHorario(h);
  if (!p) return "scheduled";
  const minutes = now.getHours() * 60 + now.getMinutes();
  if (minutes >= p.start && minutes < p.end) return "now";
  if (minutes < p.start) return p.start - minutes <= 60 ? "next" : "scheduled";
  return "done";
};

// Sort priority: now → next → scheduled → done; tie-breaker by start time
const statusRank: Record<Status, number> = { now: 0, next: 1, scheduled: 2, done: 3 };

const TVKiosk = () => {
  const { settings } = useSettings();
  const [rows, setRows] = useState<Ensalamento[]>([]);
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const [now, setNow] = useState(new Date());
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mobileTab, setMobileTab] = useState<"ensalamento" | "auditorio">("ensalamento");

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const load = async () => {
    try {
      const [ens, ev, av] = await Promise.all([
        supabase.from("ensalamento").select("*").order("turno").order("horario"),
        supabase.from("auditorio_eventos").select("*").gte("fim", new Date().toISOString()).order("inicio").limit(10),
        supabase.from("avisos").select("*").eq("ativo", true).order("ordem"),
      ]);
      const errs = [ens.error, ev.error, av.error].filter(Boolean);
      if (errs.length) {
        setLoadError(errs.map((e) => e!.message).join(" • "));
      } else {
        setLoadError(null);
      }
      setRows((ens.data as Ensalamento[]) ?? []);
      setEventos((ev.data as Evento[]) ?? []);
      setAvisos((av.data as Aviso[]) ?? []);
    } catch (e: any) {
      setLoadError(e?.message ?? "Erro desconhecido ao carregar dados");
    }
  };

  useEffect(() => {
    load();
    const ch = supabase
      .channel("tv-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "ensalamento" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "auditorio_eventos" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "avisos" }, () => load())
      .subscribe();
    const refresh = setInterval(load, 5 * 60 * 1000);
    return () => { supabase.removeChannel(ch); clearInterval(refresh); };
  }, []);

  const today = dayKey(now);

  const sorted = useMemo(() => {
    if (!today) return [];
    const list = rows
      .map((r) => ({ ...r, disciplina: (r as any)[today] as string | null }))
      .filter((r) => r.disciplina && r.disciplina.trim().length > 0);
    return list.sort((a, b) => {
      const sa = statusFor(a.horario, now);
      const sb = statusFor(b.horario, now);
      if (sa !== sb) return statusRank[sa] - statusRank[sb];
      return (parseHorario(a.horario)?.start ?? 9999) - (parseHorario(b.horario)?.start ?? 9999);
    });
  }, [rows, today, now]);

  const dateStr = now.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
  const timeStr = now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  const ocorrendo = sorted.filter((r) => statusFor(r.horario, now) === "now").length;
  const proximas = sorted.filter((r) => statusFor(r.horario, now) === "next").length;

  // Marquee text
  const marqueeText = avisos.length
    ? avisos.map((a) => a.texto).join("   •   ")
    : "Bem-vindo! Acompanhe a programação no painel acima.";

  // QR code → current TV URL (mobile-friendly)
  const tvUrl = typeof window !== "undefined" ? window.location.origin + "/tv" : "";

  const fmtEvento = (iso: string) => new Date(iso).toLocaleString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

  return (
    <div className="min-h-screen w-full overflow-x-hidden gradient-mesh animate-mesh relative flex flex-col">
      {/* Header */}
      <header className="px-4 sm:px-6 md:px-10 pt-4 sm:pt-6 pb-3 flex flex-wrap items-center justify-between gap-3 sm:gap-4">
        <div className="flex items-center gap-3 sm:gap-4 min-w-0">
          {settings.logo_url ? (
            <img src={settings.logo_url} alt={settings.brand_name} className="w-12 h-12 sm:w-14 sm:h-14 md:w-16 md:h-16 rounded-2xl object-cover shadow-glow flex-shrink-0" />
          ) : (
            <div className="w-12 h-12 sm:w-14 sm:h-14 md:w-16 md:h-16 rounded-2xl gradient-brand flex items-center justify-center shadow-brand flex-shrink-0">
              <GraduationCap className="w-7 h-7 sm:w-8 sm:h-8 md:w-9 md:h-9 text-primary-foreground" />
            </div>
          )}
          <div className="min-w-0">
            <h1 className="text-xl sm:text-3xl md:text-5xl font-bold gradient-text leading-none truncate">{settings.brand_name}</h1>
            <p className="text-muted-foreground text-xs sm:text-sm md:text-xl mt-1 truncate">{settings.unit_name}</p>
          </div>
        </div>

        <div className="text-right glass-card px-3 sm:px-5 md:px-8 py-2 sm:py-3 md:py-4 ml-auto">
          <div className="text-2xl sm:text-4xl md:text-6xl font-bold tabular-nums tracking-tight gradient-text leading-none">
            {timeStr}
          </div>
          <div className="text-muted-foreground capitalize text-[10px] sm:text-xs md:text-base mt-1 md:mt-2">{dateStr}</div>
        </div>
      </header>

      {/* Status badges */}
      <div className="px-4 sm:px-6 md:px-10 pb-3 flex flex-wrap items-center gap-2 md:gap-3">
        <span className="glass-card px-3 md:px-4 py-1.5 md:py-2 text-xs md:text-sm font-medium inline-flex items-center gap-2">
          <Radio className="w-3 h-3 md:w-4 md:h-4 text-destructive animate-pulse" />
          <span className="text-primary font-bold">{ocorrendo}</span> ao vivo agora
        </span>
        <span className="glass-card px-3 md:px-4 py-1.5 md:py-2 text-xs md:text-sm font-medium">
          <span className="font-bold">{proximas}</span> próximas
        </span>
        <span className="glass-card px-3 md:px-4 py-1.5 md:py-2 text-xs md:text-sm font-medium">
          <span className="font-bold gradient-text">{sorted.length}</span> aulas hoje
        </span>
      </div>

      {/* Error banner */}
      {loadError && (
        <div className="mx-4 sm:mx-6 md:mx-10 mb-3 glass-card border-destructive/40 bg-destructive/10 px-4 py-3 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
          <div className="text-xs md:text-sm min-w-0">
            <p className="font-bold text-destructive">Erro ao carregar dados</p>
            <p className="text-muted-foreground break-words">{loadError}</p>
          </div>
        </div>
      )}

      {/* Mobile tabs (only < xl) */}
      <div className="xl:hidden px-4 sm:px-6 pb-3 flex gap-2">
        <button
          onClick={() => setMobileTab("ensalamento")}
          className={`flex-1 px-4 py-2 rounded-xl text-sm font-bold transition-smooth ${
            mobileTab === "ensalamento" ? "gradient-brand text-primary-foreground shadow-brand" : "glass-card text-muted-foreground"
          }`}
        >
          Ensalamento ({sorted.length})
        </button>
        <button
          onClick={() => setMobileTab("auditorio")}
          className={`flex-1 px-4 py-2 rounded-xl text-sm font-bold transition-smooth ${
            mobileTab === "auditorio" ? "gradient-brand text-primary-foreground shadow-brand" : "glass-card text-muted-foreground"
          }`}
        >
          Auditório ({eventos.length})
        </button>
      </div>

      {/* Main grid + sidebar */}
      <main className="px-4 sm:px-6 md:px-10 pb-3 flex-1 grid grid-cols-1 xl:grid-cols-[1fr_340px] gap-4 md:gap-5 min-h-0">
        <section className={`overflow-hidden ${mobileTab === "auditorio" ? "hidden xl:block" : ""}`}>
          {sorted.length === 0 ? (
            <div className="h-full flex items-center justify-center">
              <div className="glass-card p-8 md:p-12 text-center max-w-md">
                <GraduationCap className="w-16 h-16 mx-auto text-primary mb-4" />
                <h2 className="text-2xl md:text-3xl font-bold mb-2">Nenhuma aula em andamento</h2>
                <p className="text-muted-foreground">Aproveite seu dia! 🌸</p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5 h-full content-start overflow-y-auto pr-1">
              {sorted.slice(0, 18).map((r) => {
                const st = statusFor(r.horario, now);
                const isNow = st === "now";
                const isNext = st === "next";
                const isDone = st === "done";
                return (
                  <div
                    key={r.id}
                    className={`glass-card p-4 sm:p-5 md:p-6 transition-smooth animate-slide-up cursor-pointer hover:-translate-y-1 hover:border-primary hover:shadow-brand relative ${
                      isDone ? "opacity-50" : ""
                    } ${isNow ? "ring-4 ring-primary shadow-brand bg-primary/5 animate-pulse-ring" : ""}`}
                  >
                    {isNow && (
                      <div className="absolute -top-3 left-4 inline-flex items-center gap-1.5 bg-destructive text-destructive-foreground text-[10px] md:text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-full shadow-lg">
                        <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                        Ao vivo
                      </div>
                    )}
                    {isNext && (
                      <div className="absolute -top-3 left-4 inline-flex items-center gap-1.5 bg-secondary text-secondary-foreground text-[10px] md:text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-full">
                        Próxima
                      </div>
                    )}

                    <div className="flex items-start justify-between mb-3 mt-1 gap-2">
                      <div className="flex items-center gap-2 min-w-0 flex-wrap">
                        <MapPin className="w-5 h-5 text-primary flex-shrink-0" />
                        <span className="text-lg sm:text-xl md:text-2xl font-bold truncate">{r.sala}</span>
                        {r.bloco && <span className="text-xs md:text-sm text-muted-foreground">• Bloco {r.bloco}</span>}
                      </div>
                    </div>

                    <h3 className={`text-base sm:text-lg md:text-xl font-semibold mb-3 text-balance line-clamp-2 ${isNow ? "text-primary" : ""}`}>
                      {(r as any).disciplina}
                    </h3>

                    <div className="space-y-1.5 text-sm text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 flex-shrink-0" />
                        <span className="tabular-nums font-medium">{r.horario}</span>
                      </div>
                      {r.professor && (
                        <div className="flex items-center gap-2">
                          <User className="w-4 h-4 flex-shrink-0" />
                          <span className="truncate">{r.professor}</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Sidebar (Auditório + QR): visible on desktop always; on mobile only when tab=auditorio */}
        <aside className={`flex-col gap-4 min-h-0 ${mobileTab === "auditorio" ? "flex" : "hidden"} xl:flex`}>
          <div className="glass-card p-4 sm:p-5 flex-1 min-h-0 flex flex-col">
            <h3 className="font-bold text-base sm:text-lg flex items-center gap-2 mb-3">
              <Mic className="w-5 h-5 text-primary" /> Próximos no Auditório
            </h3>
            <div className="space-y-3 overflow-y-auto pr-1 flex-1">
              {eventos.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">Nenhum evento agendado</p>
              ) : eventos.map((e) => {
                const ativo = new Date(e.inicio) <= now && new Date(e.fim) > now;
                return (
                  <div key={e.id} className={`p-3 rounded-xl border transition-smooth ${ativo ? "border-primary bg-primary/10 shadow-brand animate-pulse-ring" : "border-border"}`}>
                    {ativo && (
                      <div className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider bg-destructive text-destructive-foreground px-2 py-0.5 rounded-full mb-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" /> Ao vivo
                      </div>
                    )}
                    <p className="font-semibold text-sm leading-tight line-clamp-2">{e.nome}</p>
                    <p className="text-xs text-muted-foreground mt-1 capitalize">{fmtEvento(e.inicio)}</p>
                    {e.responsavel && <p className="text-xs text-muted-foreground">{e.responsavel}</p>}
                    {e.local && <p className="text-[10px] text-muted-foreground">{e.local}</p>}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="glass-card p-4 flex items-center gap-4">
            <div className="bg-white p-2 rounded-lg flex-shrink-0">
              <QRCodeSVG value={tvUrl} size={84} />
            </div>
            <div className="text-xs min-w-0">
              <p className="font-bold mb-1">Leve no celular</p>
              <p className="text-muted-foreground leading-snug">Aponte sua câmera para abrir o ensalamento.</p>
            </div>
          </div>
        </aside>
      </main>

      {/* Marquee */}
      <div className="bg-primary/95 text-primary-foreground py-2.5 overflow-hidden relative">
        <div className="flex items-center gap-3 whitespace-nowrap animate-marquee">
          {Array.from({ length: 2 }).map((_, i) => (
            <span key={i} className="inline-flex items-center gap-3 text-sm md:text-base font-medium px-6">
              <Radio className="w-4 h-4 inline" /> AVISOS &nbsp;•&nbsp; {marqueeText}
            </span>
          ))}
        </div>
      </div>

      {/* Footer */}
      <footer className="px-6 md:px-10 py-2 flex items-center justify-between text-xs text-muted-foreground border-t border-border">
        <span>Desenvolvido por <span className="font-semibold text-foreground">Michael Pithon</span></span>
        <a href="/login" className="glass px-3 py-1.5 rounded-full hover:text-primary hover:border-primary/40 transition-smooth inline-flex items-center gap-1.5">
          🔒 Painel Administrativo
        </a>
      </footer>
    </div>
  );
};

export default TVKiosk;
