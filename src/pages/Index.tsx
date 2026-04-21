import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Monitor, Settings, GraduationCap, Sparkles } from "lucide-react";
import { useSettings } from "@/contexts/SettingsContext";
import { FeedbackModal } from "@/components/FeedbackModal";

const Index = () => {
  const { settings } = useSettings();
  return (
    <div className="min-h-screen flex flex-col gradient-mesh animate-mesh">
      <main className="flex-1 flex items-center justify-center px-6 py-16">
        <div className="max-w-5xl w-full">
          <div className="text-center mb-16 animate-slide-up">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass text-sm font-medium mb-6">
              <Sparkles className="w-4 h-4 text-primary" />
              Sistema de Ensalamento Acadêmico
            </div>
            <div className="flex items-center justify-center gap-3 mb-6 animate-float">
              {settings.logo_url ? (
                <img src={settings.logo_url} alt={settings.brand_name} className="w-16 h-16 rounded-2xl object-cover shadow-glow" />
              ) : (
                <div className="w-16 h-16 rounded-2xl gradient-brand flex items-center justify-center shadow-brand">
                  <GraduationCap className="w-9 h-9 text-primary-foreground" />
                </div>
              )}
              <h1 className="text-6xl md:text-7xl font-bold tracking-tight gradient-text">
                {settings.brand_name}
              </h1>
            </div>
            <p className="text-xl md:text-2xl text-muted-foreground max-w-2xl mx-auto text-balance">
              {settings.unit_name} — encontre sua sala de aula em segundos.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-6 max-w-3xl mx-auto">
            <Link to="/tv" className="group">
              <div className="glass-card p-8 transition-smooth group-hover:scale-[1.02] h-full">
                <div className="w-14 h-14 rounded-xl gradient-brand flex items-center justify-center mb-5 group-hover:scale-110 transition-smooth shadow-brand">
                  <Monitor className="w-7 h-7 text-primary-foreground" />
                </div>
                <h2 className="text-2xl font-bold mb-2">Painel TV / Kiosk</h2>
                <p className="text-muted-foreground mb-5">
                  Visualização em tela cheia com as aulas de hoje, status em tempo real.
                </p>
                <Button className="w-full gradient-brand border-0 shadow-brand">Abrir Painel</Button>
              </div>
            </Link>

            <Link to="/admin" className="group">
              <div className="glass-card p-8 transition-smooth group-hover:scale-[1.02] h-full">
                <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center mb-5 group-hover:scale-110 transition-smooth">
                  <Settings className="w-7 h-7 text-primary" />
                </div>
                <h2 className="text-2xl font-bold mb-2">Área Administrativa</h2>
                <p className="text-muted-foreground mb-5">
                  Gerencie salas, horários, professores e usuários administradores.
                </p>
                <Button variant="outline" className="w-full">Acessar Admin</Button>
              </div>
            </Link>
          </div>
        </div>
      </main>

      <footer className="py-6 text-center text-sm text-muted-foreground">
        Desenvolvido por <span className="font-semibold text-foreground">Michael Pithon</span> 👨🏽‍💻
      </footer>
      <FeedbackModal />
    </div>
  );
};

export default Index;
