import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Monitor, Settings, GraduationCap, Sparkles } from "lucide-react";

const Index = () => {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Hero */}
      <main className="flex-1 flex items-center justify-center px-6 py-16">
        <div className="max-w-5xl w-full">
          <div className="text-center mb-16 animate-slide-up">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary-soft text-primary mb-6 text-sm font-medium">
              <Sparkles className="w-4 h-4" />
              Sistema de Ensalamento Acadêmico
            </div>
            <div className="flex items-center justify-center gap-3 mb-6">
              <div className="w-14 h-14 rounded-2xl gradient-primary flex items-center justify-center shadow-glow">
                <GraduationCap className="w-8 h-8 text-primary-foreground" />
              </div>
              <h1 className="text-6xl md:text-7xl font-bold tracking-tight">
                Afya
              </h1>
            </div>
            <p className="text-xl md:text-2xl text-muted-foreground max-w-2xl mx-auto text-balance">
              Encontre sua sala de aula em segundos. Informações em tempo real para alunos e professores.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-6 max-w-3xl mx-auto">
            <Link to="/tv" className="group">
              <div className="bg-card rounded-2xl p-8 shadow-elegant hover:shadow-premium transition-smooth border border-border hover:border-primary/30 h-full">
                <div className="w-14 h-14 rounded-xl bg-primary-soft flex items-center justify-center mb-5 group-hover:scale-110 transition-smooth">
                  <Monitor className="w-7 h-7 text-primary" />
                </div>
                <h2 className="text-2xl font-bold mb-2">Painel TV / Kiosk</h2>
                <p className="text-muted-foreground mb-5">
                  Visualização em tela cheia com as aulas de hoje, status em tempo real.
                </p>
                <Button variant="default" className="w-full">
                  Abrir Painel
                </Button>
              </div>
            </Link>

            <Link to="/admin" className="group">
              <div className="bg-card rounded-2xl p-8 shadow-elegant hover:shadow-premium transition-smooth border border-border hover:border-primary/30 h-full">
                <div className="w-14 h-14 rounded-xl bg-primary-soft flex items-center justify-center mb-5 group-hover:scale-110 transition-smooth">
                  <Settings className="w-7 h-7 text-primary" />
                </div>
                <h2 className="text-2xl font-bold mb-2">Área Administrativa</h2>
                <p className="text-muted-foreground mb-5">
                  Gerencie salas, horários, professores e usuários administradores.
                </p>
                <Button variant="outline" className="w-full">
                  Acessar Admin
                </Button>
              </div>
            </Link>
          </div>
        </div>
      </main>

      <footer className="py-6 text-center text-sm text-muted-foreground border-t border-border">
        Desenvolvido por <span className="font-semibold text-foreground">Michael Pithon</span>
      </footer>
    </div>
  );
};

export default Index;
