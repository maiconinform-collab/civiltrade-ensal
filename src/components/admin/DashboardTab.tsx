import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { CalendarDays, Users, BookOpen, MapPin, Clock } from "lucide-react";

type Stats = {
  aulas: number; professores: number; disciplinas: number; salas: number; horarios: number;
};

const Card = ({ icon: Icon, label, value }: { icon: any; label: string; value: number | string }) => (
  <div className="glass-card p-6 transition-smooth hover:scale-[1.02]">
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

const DashboardTab = () => {
  const [s, setS] = useState<Stats>({ aulas: 0, professores: 0, disciplinas: 0, salas: 0, horarios: 0 });

  useEffect(() => {
    const load = async () => {
      const [a, p, d, sa, h] = await Promise.all([
        supabase.from("ensalamento").select("id", { count: "exact", head: true }),
        supabase.from("professores").select("id", { count: "exact", head: true }),
        supabase.from("disciplinas").select("id", { count: "exact", head: true }),
        supabase.from("salas").select("id", { count: "exact", head: true }),
        supabase.from("horarios").select("id", { count: "exact", head: true }),
      ]);
      setS({
        aulas: a.count ?? 0, professores: p.count ?? 0, disciplinas: d.count ?? 0,
        salas: sa.count ?? 0, horarios: h.count ?? 0,
      });
    };
    load();
  }, []);

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="text-2xl font-bold">Visão Geral</h2>
        <p className="text-muted-foreground text-sm">Resumo dos cadastros do sistema</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        <Card icon={CalendarDays} label="Aulas" value={s.aulas} />
        <Card icon={Users} label="Professores" value={s.professores} />
        <Card icon={BookOpen} label="Disciplinas" value={s.disciplinas} />
        <Card icon={MapPin} label="Salas" value={s.salas} />
        <Card icon={Clock} label="Horários" value={s.horarios} />
      </div>
    </div>
  );
};

export default DashboardTab;
