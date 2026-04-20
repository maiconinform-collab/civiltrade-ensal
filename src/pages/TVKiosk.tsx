import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { GraduationCap, Clock, MapPin, User, Calendar } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

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

type Aula = {
  id: string;
  sala: string;
  bloco: string | null;
  professor: string | null;
  horario: string;
  disciplina: string;
  turno: string;
  startMin: number;
  endMin: number;
};

const dayKeyMap: Record<number, keyof Ensalamento | null> = {
  0: null, // domingo
  1: "segunda",
  2: "terca",
  3: "quarta",
  4: "quinta",
  5: "sexta",
  6: "sabado",
};

function parseHorario(horario: string): { startMin: number; endMin: number } {
  // Aceita "08:00-10:00", "08:00–10:00", "08:00 - 10:00"
  const clean = horario.replace(/–|—/g, "-");
  const [a, b] = clean.split("-").map((s) => s.trim());
  const toMin = (t: string) => {
    const [h, m] = t.split(":").map((n) => parseInt(n, 10));
    return (h || 0) * 60 + (m || 0);
  };
  return { startMin: toMin(a), endMin: toMin(b || a) };
}

const TVKiosk = () => {
  const [aulas, setAulas] = useState<Aula[]>([]);
  const [now, setNow] = useState(new Date());
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    const { data, error } = await supabase.from("ensalamento").select("*");
    if (error) {
      console.error(error);
      setLoading(false);
      return;
    }
    const today = new Date();
    const dayKey = dayKeyMap[today.getDay()];
    if (!dayKey) {
      setAulas([]);
      setLoading(false);
      return;
    }
    const list: Aula[] = [];
    (data as Ensalamento[]).forEach((row) => {
      const disciplina = row[dayKey] as string | null;
      if (disciplina && disciplina.trim()) {
        const { startMin, endMin } = parseHorario(row.horario);
        list.push({
          id: row.id,
          sala: row.sala,
          bloco: row.bloco,
          professor: row.professor,
          horario: row.horario,
          disciplina,
          turno: row.turno,
          startMin,
          endMin,
        });
      }
    });
    list.sort((a, b) => a.startMin - b.startMin);
    setAulas(list);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5 * 60 * 1000); // 5 min
    const clock = setInterval(() => setNow(new Date()), 30 * 1000);
    return () => {
      clearInterval(interval);
      clearInterval(clock);
    };
  }, []);

  const nowMin = now.getHours() * 60 + now.getMinutes();

  const getStatus = (a: Aula): "agora" | "proxima" | "encerrada" => {
    if (nowMin >= a.startMin && nowMin < a.endMin) return "agora";
    if (nowMin < a.startMin) return "proxima";
    return "encerrada";
  };

  const aulasAgora = aulas.filter((a) => getStatus(a) === "agora");
  const aulasProximas = aulas.filter((a) => getStatus(a) === "proxima");
  const aulasEncerradas = aulas.filter((a) => getStatus(a) === "encerrada");

  const ordenadas = [...aulasAgora, ...aulasProximas, ...aulasEncerradas];

  return (
    <div className="h-screen w-screen overflow-hidden bg-background flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-8 py-5 gradient-primary text-primary-foreground shrink-0">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center">
            <GraduationCap className="w-7 h-7" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight leading-none">Afya</h1>
            <p className="text-sm text-white/85 mt-1">Ensalamento Acadêmico</p>
          </div>
        </div>
        <div className="text-right">
          <div className="text-4xl font-bold tabular-nums leading-none">
            {format(now, "HH:mm")}
          </div>
          <div className="text-sm text-white/85 mt-1 capitalize flex items-center justify-end gap-2">
            <Calendar className="w-4 h-4" />
            {format(now, "EEEE, dd 'de' MMMM", { locale: ptBR })}
          </div>
        </div>
      </header>

      {/* Conteúdo */}
      <main className="flex-1 overflow-hidden p-6">
        {loading ? (
          <div className="h-full flex items-center justify-center text-muted-foreground text-xl">
            Carregando aulas...
          </div>
        ) : ordenadas.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center">
            <div className="w-24 h-24 rounded-full bg-primary-soft flex items-center justify-center mb-6">
              <Calendar className="w-12 h-12 text-primary" />
            </div>
            <h2 className="text-3xl font-bold mb-2">Nenhuma aula agendada para hoje</h2>
            <p className="text-muted-foreground text-lg">Aproveite o seu dia! 🎓</p>
          </div>
        ) : (
          <div className="h-full grid auto-rows-fr gap-4" style={{
            gridTemplateColumns: `repeat(${Math.min(Math.max(Math.ceil(Math.sqrt(ordenadas.length)), 2), 4)}, minmax(0, 1fr))`,
          }}>
            {ordenadas.slice(0, 12).map((a, idx) => {
              const status = getStatus(a);
              const isAgora = status === "agora";
              const isEncerrada = status === "encerrada";

              return (
                <div
                  key={a.id}
                  className={`relative rounded-2xl p-5 flex flex-col justify-between border transition-smooth animate-slide-up ${
                    isAgora
                      ? "bg-card border-primary shadow-glow"
                      : isEncerrada
                      ? "bg-muted/50 border-border opacity-60"
                      : "bg-card border-border shadow-elegant"
                  }`}
                  style={{ animationDelay: `${idx * 50}ms` }}
                >
                  {/* Status badge */}
                  <div className="flex items-center justify-between mb-3">
                    <div
                      className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold ${
                        isAgora
                          ? "bg-primary text-primary-foreground"
                          : isEncerrada
                          ? "bg-muted text-muted-foreground"
                          : "bg-primary-soft text-primary"
                      }`}
                    >
                      {isAgora && <span className="w-2 h-2 rounded-full bg-white animate-pulse" />}
                      {isAgora ? "ACONTECENDO AGORA" : isEncerrada ? "ENCERRADA" : "PRÓXIMA"}
                    </div>
                    <div className="flex items-center gap-1.5 text-sm font-semibold tabular-nums text-foreground/80">
                      <Clock className="w-4 h-4" />
                      {a.horario}
                    </div>
                  </div>

                  {/* Disciplina */}
                  <div className="flex-1 flex flex-col justify-center py-2">
                    <h3 className="text-2xl font-bold leading-tight mb-2 text-balance">
                      {a.disciplina}
                    </h3>
                    {a.professor && (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <User className="w-4 h-4 shrink-0" />
                        <span className="text-base truncate">{a.professor}</span>
                      </div>
                    )}
                  </div>

                  {/* Sala */}
                  <div
                    className={`mt-3 rounded-xl p-3 flex items-center gap-3 ${
                      isAgora ? "gradient-primary text-primary-foreground" : "bg-muted"
                    }`}
                  >
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                      isAgora ? "bg-white/20" : "bg-primary-soft"
                    }`}>
                      <MapPin className={`w-5 h-5 ${isAgora ? "text-white" : "text-primary"}`} />
                    </div>
                    <div className="min-w-0">
                      <div className={`text-xs uppercase tracking-wide font-medium ${
                        isAgora ? "text-white/80" : "text-muted-foreground"
                      }`}>
                        Sala {a.bloco ? `· Bloco ${a.bloco}` : ""}
                      </div>
                      <div className="text-xl font-bold leading-tight truncate">
                        {a.sala}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="shrink-0 px-8 py-3 border-t border-border bg-card flex items-center justify-between text-sm">
        <div className="flex items-center gap-6 text-muted-foreground">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-primary animate-pulse" />
            <span>{aulasAgora.length} acontecendo agora</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-primary/40" />
            <span>{aulasProximas.length} próximas</span>
          </div>
        </div>
        <div className="text-muted-foreground">
          Desenvolvido por <span className="font-semibold text-foreground">Michael Pithon</span>
        </div>
      </footer>
    </div>
  );
};

export default TVKiosk;
