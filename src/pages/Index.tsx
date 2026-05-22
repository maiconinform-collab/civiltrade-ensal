/**
 * Este componente renderiza a página inicial (Landing Page) do sistema.
 * Ele serve como um portal de entrada, oferecendo links rápidos para o
 * Painel da TV (Kiosk) e para a Área Administrativa.
 * 
 * Objetivo: Ser a primeira tela que o usuário vê, com uma interface
 * amigável, apresentando o logo e nome da instituição (buscados dinamicamente).
 */

import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Monitor, Settings, GraduationCap, Sparkles } from "lucide-react";
import { useSettings } from "@/contexts/SettingsContext";
import { FeedbackModal } from "@/components/FeedbackModal";
import { siteConfig } from "@/config/siteConfig";

const Index = () => {
  // --- VARIÁVEIS CRÍTICAS E ESTADOS ---
  // settings: Variável que guarda as configurações visuais globais (logo_url, brand_name, unit_name).
  // Essas informações vêm do banco de dados (tabela settings) através do contexto SettingsContext.
  const { settings } = useSettings();

  // --- RENDERIZAÇÃO DA INTERFACE ---
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

          {/* --- OPÇÕES DE NAVEGAÇÃO (CARDS) --- */}
          <div className="grid md:grid-cols-2 gap-6 max-w-3xl mx-auto mb-6">
            <Link to="/trade/tv" className="group">
              <div className="glass-card p-8 transition-smooth group-hover:scale-[1.02] h-full">
                <div className="w-14 h-14 rounded-xl gradient-brand flex items-center justify-center mb-5 group-hover:scale-110 transition-smooth shadow-brand">
                  <Monitor className="w-7 h-7 text-primary-foreground" />
                </div>
                <h2 className="text-2xl font-bold mb-2">Painel Civil Trade</h2>
                <p className="text-muted-foreground mb-5">
                  Aulas e eventos da unidade Civil Trade em tempo real.
                </p>
                <Button className="w-full gradient-brand border-0 shadow-brand">Abrir Painel</Button>
              </div>
            </Link>

            <Link to="/patamares/tv" className="group">
              <div className="glass-card p-8 transition-smooth group-hover:scale-[1.02] h-full border-blue-500/30">
                <div className="w-14 h-14 rounded-xl bg-blue-600 flex items-center justify-center mb-5 group-hover:scale-110 transition-smooth shadow-lg shadow-blue-500/20">
                  <Monitor className="w-7 h-7 text-white" />
                </div>
                <h2 className="text-2xl font-bold mb-2">Painel Patamares</h2>
                <p className="text-muted-foreground mb-5">
                  Aulas e eventos da unidade Patamares em tempo real.
                </p>
                <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white border-0 shadow-lg shadow-blue-500/20">Abrir Painel</Button>
              </div>
            </Link>
          </div>
          
          <div className="max-w-3xl mx-auto">
            <Link to="/admin" className="group">
              <div className="glass-card p-6 flex items-center gap-6 transition-smooth group-hover:scale-[1.01]">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex-shrink-0 flex items-center justify-center group-hover:scale-110 transition-smooth">
                  <Settings className="w-6 h-6 text-primary" />
                </div>
                <div className="flex-1">
                  <h2 className="text-xl font-bold">Área Administrativa Central</h2>
                  <p className="text-sm text-muted-foreground">
                    Gerencie o ensalamento, auditório e avisos de todas as unidades.
                  </p>
                </div>
                <Button variant="outline" className="hidden sm:flex">Acessar Admin</Button>
              </div>
            </Link>
          </div>
        </div>
      </main>

      {/* --- RODAPÉ --- */}
      {/* Aqui fica a assinatura do projeto, puxando os dados do arquivo de configuração (siteConfig) */}
      <footer className="py-6 flex items-center justify-center gap-3 text-sm text-muted-foreground">
        <img src={siteConfig.devAvatarUrl} alt={siteConfig.devName} className="w-8 h-8 rounded-full border border-primary/20 shadow-sm object-cover" />
        <span>Desenvolvido por <span className="font-semibold text-foreground">{siteConfig.devName}</span> 👨🏽‍💻</span>
      </footer>
      <FeedbackModal />
    </div>
  );
};

export default Index;
