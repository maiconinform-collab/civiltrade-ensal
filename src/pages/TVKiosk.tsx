import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { GraduationCap, MapPin, Clock, User } from "lucide-react";
import { useSettings } from "@/contexts/SettingsContext";

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

const statusFor = (h: string, now: Date) => {
  const p = parseHorario(h);
  if (!p) return "scheduled";
  const minutes = now.getHours() * 60 + now.getMinutes();
  if (minutes >= p.start && minutes < p.end) return "now";
  if (minutes < p.start && p.start - minutes <= 30) return "next";
  if (minutes >= p.end) return "done";
  return "scheduled";
};

const TVKiosk = () => {
  const { settings } = useSettings();
  const [rows, setRows] = useState<Ensalamento[]>([]);
  const [now, setNow] = useState(new Date());
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const load = async () => {
    const { data } = await supabase
      .from("ensalamento")
      .select("*")
      .order("turno")
      .order("horario");
    setRows((data as Ensalamento[]) ?? []);
    setTick((x) => x + 1);
  };

  useEffect(() => {
    load();
    const channel = supabase
      .channel("ensalamento-tv")
      .on("postgres_changes", { event: "*", schema: "public", table: "ensalamento" }, () => load())
      .subscribe();
    const refresh = setInterval(load, 5 * 60 * 1000);
    return () => {
      supabase.removeChannel(channel);
      clearInterval(refresh);
    };
  }, []);

  const today = dayKey(now);

  const sorted = useMemo(() => {
    if (!today) return [];
    const list = rows
      .map((r) => ({ ...r, disciplina: (r as any)[today] as string | null }))
      .filter((r) => r.disciplina && r.disciplina.trim().length > 0);
    const order = (h: string) => parseHorario(h)?.start ?? 9999;
    return list.sort((a, b) => order(a.horario) - order(b.horario));
  }, [rows, today]);

  const dateStr = now.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  const timeStr = now.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const ocorrendo = sorted.filter((r) => statusFor(r.horario, now) === "now").length;

  return (
    <div className="h-screen w-screen overflow-hidden gradient-mesh animate-mesh relative">
      <header className="px-10 pt-8 pb-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          {settings.logo_url ? (
            <img src={settings.logo_url} alt={settings.brand_name} className="w-16 h-16 rounded-2xl object-cover shadow-glow" />
          ) : (
            <div className="w-16 h-16 rounded-2xl gradient-brand flex items-center justify-center shadow-brand">
              <GraduationCap className="w-9 h-9 text-primary-foreground" />
            </div>
          )}
          <div>
            <h1 className="text-5xl font-bold gradient-text leading-none">{settings.brand_name}</h1>
            <p className="text-muted-foreground text-xl mt-1">{settings.unit_name}</p>
          </div>
        </div>

        <div className="text-right glass-card px-8 py-4">
          <div className="text-6xl font-bold tabular-nums tracking-tight gradient-text leading-none">
            {timeStr}
          </div>
          <div className="text-muted-foreground capitalize text-base mt-2">{dateStr}</div>
        </div>
      </header>

      <div className="px-10 pb-4 flex items-center gap-3">
        <span className="glass-card px-4 py-2 text-sm font-medium">
          <span className="text-primary font-bold">{ocorrendo}</span> aula{ocorrendo === 1 ? "" : "s"} acontecendo agora
        </span>
        <span className="glass-card px-4 py-2 text-sm font-medium">
          <span className="font-bold gradient-text">{sorted.length}</span> aulas hoje
        </span>
      </div>

      <main key={tick} className="px-10 pb-8 h-[calc(100vh-220px)] overflow-hidden animate-fade-in">
        {sorted.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <div className="glass-card p-12 text-center max-w-md">
              <GraduationCap className="w-16 h-16 mx-auto text-primary mb-4" />
              <h2 className="text-3xl font-bold mb-2">Sem aulas hoje</h2>
              <p className="text-muted-foreground">Aproveite seu dia! 🌸</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5 h-full content-start">
            {sorted.slice(0, 16).map((r) => {
              const st = statusFor(r.horario, now);
              const isNow = st === "now";
              const isNext = st === "next";
              const isDone = st === "done";
              return (
                <div
                  key={r.id}
                  className={`glass-card p-6 transition-smooth animate-slide-up cursor-pointer hover:-translate-y-1 hover:border-primary hover:shadow-brand ${
                    isDone ? "opacity-50" : ""
                  } ${isNow ? "ring-2 ring-primary shadow-brand" : ""}`}
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <MapPin className="w-5 h-5 text-primary" />
                      <span className="text-2xl font-bold">{r.sala}</span>
                      {r.bloco && (
                        <span className="text-sm text-muted-foreground">• Bloco {r.bloco}</span>
                      )}
                    </div>
                    {isNow && (
                      <span className="text-xs font-bold uppercase tracking-wider text-primary-foreground bg-primary px-2 py-1 rounded-full animate-pulse-ring">
                        Agora
                      </span>
                    )}
                    {isNext && (
                      <span className="text-xs font-bold uppercase tracking-wider text-secondary-foreground bg-secondary px-2 py-1 rounded-full">
                        Próxima
                      </span>
                    )}
                  </div>

                  <h3 className="text-xl font-semibold mb-3 text-balance line-clamp-2">
                    {(r as any).disciplina}
                  </h3>

                  <div className="space-y-2 text-sm text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4" />
                      <span className="tabular-nums font-medium">{r.horario}</span>
                    </div>
                    {r.professor && (
                      <div className="flex items-center gap-2">
                        <User className="w-4 h-4" />
                        <span className="truncate">{r.professor}</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      <footer className="absolute bottom-3 left-0 right-0 px-10 flex items-center justify-between text-xs text-muted-foreground">
        <span>
          Desenvolvido por <span className="font-semibold text-foreground">Michael Pithon</span>
        </span>
        <a
          href="/login"
          className="glass px-3 py-1.5 rounded-full hover:text-primary hover:border-primary/40 transition-smooth inline-flex items-center gap-1.5"
        >
          🔒 Painel Administrativo
        </a>
      </footer>
    </div>
  );
};

export default TVKiosk;
