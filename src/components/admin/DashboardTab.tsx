import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { CalendarDays, Users, BookOpen, MapPin, Clock, Star, AlertTriangle } from "lucide-react";

type Stats = {
  aulas: number; professores: number; disciplinas: number; salas: number; horarios: number;
  media_ratings: number; total_ratings: number; low_ratings: number;
};

const Card = ({ icon: Icon, label, value, className = "" }: { icon: any; label: string; value: number | string; className?: string }) => (
  <div className={`glass-card p-6 transition-smooth hover:scale-[1.02] ${className}`}>
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="text-3xl font-bold gradient-text mt-1">{value}</p>
      </div>
      <div className="w-12 h-12 rounded-xl gradient-brand flex items-center justify-center shadow-brand">
        <Icon className="w-6 h-6 text-primary-foreground" />
      </div>
    </div>
  </div>
);

const DashboardTab = ({ unidade }: { unidade: string }) => {
  const [s, setS] = useState<Stats>({ aulas: 0, professores: 0, disciplinas: 0, salas: 0, horarios: 0, media_ratings: 0, total_ratings: 0, low_ratings: 0 });

  useEffect(() => {
    // Reset de Dados: limpa imediatamente os contadores
    setS({ aulas: 0, professores: 0, disciplinas: 0, salas: 0, horarios: 0, media_ratings: 0, total_ratings: 0, low_ratings: 0 });
    
    const load = async () => {
      const [a, p, d, sa, h, rt] = await Promise.all([
        supabase.from("ensalamento").select("id", { count: "exact", head: true }).eq("unidade", unidade),
        supabase.from("professores").select("id", { count: "exact", head: true }).eq("unidade", unidade),
        supabase.from("disciplinas").select("id", { count: "exact", head: true }).eq("unidade", unidade),
        supabase.from("salas").select("id", { count: "exact", head: true }).eq("unidade", unidade),
        supabase.from("horarios").select("id", { count: "exact", head: true }).eq("unidade", unidade),
        supabase.from("ratings").select("rating").eq("unidade", unidade)
      ]);
      
      let media = 0;
      let low = 0;
      const ratings = rt.data || [];
      if (ratings.length > 0) {
        media = ratings.reduce((acc, curr) => acc + curr.rating, 0) / ratings.length;
        low = ratings.filter(r => r.rating <= 2).length;
      }

      setS({
        aulas: a.count ?? 0, professores: p.count ?? 0, disciplinas: d.count ?? 0,
        salas: sa.count ?? 0, horarios: h.count ?? 0,
        media_ratings: media, total_ratings: ratings.length, low_ratings: low
      });
    };
    load();
  }, [unidade]);

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="text-2xl font-bold">Visão Geral</h2>
        <p className="text-muted-foreground text-sm">Resumo dos cadastros do sistema</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <Card icon={CalendarDays} label="Aulas" value={s.aulas} />
        <Card icon={Users} label="Professores" value={s.professores} />
        <Card icon={BookOpen} label="Disciplinas" value={s.disciplinas} />
        <Card icon={MapPin} label="Salas" value={s.salas} />
        <Card icon={Clock} label="Horários" value={s.horarios} />
        <Card icon={Star} label={`Avaliações (${s.total_ratings})`} value={s.media_ratings.toFixed(1)} />
      </div>
      
      {s.low_ratings > 3 && (
        <div className="glass-card border-destructive/40 bg-destructive/10 px-4 py-4 flex items-center gap-3">
          <AlertTriangle className="w-6 h-6 text-destructive flex-shrink-0" />
          <div>
            <p className="font-bold text-destructive">⚠️ Pontos de Melhoria</p>
            <p className="text-sm text-muted-foreground">Há {s.low_ratings} avaliações muito baixas (1 ou 2 estrelas) recentemente. Considere revisar a experiência dos alunos.</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default DashboardTab;
