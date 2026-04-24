import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard, CalendarDays, Users, BookOpen, MapPin, Clock, Mic, Megaphone, User as UserIcon,
  Settings as SettingsIcon, ShieldCheck, LogOut, Monitor, GraduationCap, Menu, X,
} from "lucide-react";
import { useUserRole } from "@/hooks/useUserRole";
import { useSettings } from "@/contexts/SettingsContext";
import DashboardTab from "@/components/admin/DashboardTab";
import EnsalamentoTab from "@/components/admin/EnsalamentoTab";
import ProfessoresTab from "@/components/admin/ProfessoresTab";
import DisciplinasTab from "@/components/admin/DisciplinasTab";
import SalasTab from "@/components/admin/SalasTab";
import HorariosTab from "@/components/admin/HorariosTab";
import AuditorioTab from "@/components/admin/AuditorioTab";
import AvisosTab from "@/components/admin/AvisosTab";
import PerfilTab from "@/components/admin/PerfilTab";
import AdminsTab from "@/components/admin/AdminsTab";
import SettingsTab from "@/components/admin/SettingsTab";
import { Loader2 } from "lucide-react";

type TabKey =
  | "dashboard" | "ensalamento" | "auditorio" | "avisos" | "professores" | "disciplinas"
  | "salas" | "horarios" | "perfil" | "admins" | "settings";

const Admin = () => {
  const navigate = useNavigate();
  const { settings } = useSettings();
  const { userId, email, isAdmin, isSuperAdmin, loading } = useUserRole();
  const [tab, setTab] = useState<TabKey>("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (!loading && !userId) navigate("/login", { replace: true });
  }, [loading, userId, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center gradient-mesh">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!userId) return null;

  if (!isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center gradient-mesh px-6">
        <div className="glass-card p-10 max-w-md text-center">
          <ShieldCheck className="w-12 h-12 text-primary mx-auto mb-4" />
          <h1 className="text-2xl font-bold mb-2">Acesso restrito</h1>
          <p className="text-muted-foreground mb-6">
            Sua conta ({email}) não tem permissão administrativa.
          </p>
          <Button onClick={async () => { await supabase.auth.signOut(); navigate("/login"); }} variant="outline">
            Sair
          </Button>
        </div>
      </div>
    );
  }

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/login");
  };

  const items: { key: TabKey; label: string; icon: any; superOnly?: boolean }[] = [
    { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { key: "ensalamento", label: "Ensalamento", icon: CalendarDays },
    { key: "auditorio", label: "Auditório", icon: Mic },
    { key: "avisos", label: "Avisos", icon: Megaphone },
    { key: "professores", label: "Professores", icon: Users },
    { key: "disciplinas", label: "Disciplinas", icon: BookOpen },
    { key: "salas", label: "Salas", icon: MapPin },
    { key: "horarios", label: "Horários", icon: Clock },
    { key: "perfil", label: "Meu Perfil", icon: UserIcon },
    { key: "admins", label: "Administradores", icon: ShieldCheck, superOnly: true },
    { key: "settings", label: "Configurações", icon: SettingsIcon, superOnly: true },
  ];

  const visibleItems = items.filter((i) => !i.superOnly || isSuperAdmin);

  return (
    <div className="min-h-screen gradient-mesh">
      {/* Mobile top bar */}
      <header className="md:hidden glass border-b border-border sticky top-0 z-40 px-4 py-3 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2">
          {settings.logo_url ? (
            <img src={settings.logo_url} alt="" className="w-8 h-8 rounded-lg object-cover" />
          ) : (
            <div className="w-8 h-8 rounded-lg gradient-brand flex items-center justify-center">
              <GraduationCap className="w-5 h-5 text-primary-foreground" />
            </div>
          )}
          <span className="font-bold gradient-text">{settings.brand_name}</span>
        </Link>
        <Button size="icon" variant="ghost" onClick={() => setSidebarOpen(true)}>
          <Menu className="w-5 h-5" />
        </Button>
      </header>

      <div className="flex">
        {/* Sidebar overlay (mobile) */}
        {sidebarOpen && (
          <div className="fixed inset-0 bg-black/40 z-40 md:hidden" onClick={() => setSidebarOpen(false)} />
        )}

        {/* Sidebar */}
        <aside
          className={`${sidebarOpen ? "translate-x-0" : "-translate-x-full"
            } md:translate-x-0 fixed md:sticky top-0 left-0 z-50 md:z-10 h-screen w-64 glass-strong border-r border-border transition-transform`}
        >
          <div className="p-5 flex items-center justify-between md:justify-start gap-3 border-b border-border">
            <Link to="/" className="flex items-center gap-3">
              {settings.logo_url ? (
                <img src={settings.logo_url} alt="" className="w-10 h-10 rounded-xl object-cover" />
              ) : (
                <div className="w-10 h-10 rounded-xl gradient-brand flex items-center justify-center shadow-brand">
                  <GraduationCap className="w-6 h-6 text-primary-foreground" />
                </div>
              )}
              <div>
                <p className="font-bold leading-none gradient-text text-lg">{settings.brand_name}</p>
                <p className="text-[10px] text-muted-foreground mt-1">Painel Master</p>
              </div>
            </Link>
            <Button size="icon" variant="ghost" className="md:hidden" onClick={() => setSidebarOpen(false)}>
              <X className="w-4 h-4" />
            </Button>
          </div>

          <nav className="p-3 space-y-1">
            {visibleItems.map((it) => {
              const Icon = it.icon;
              const active = tab === it.key;
              return (
                <button
                  key={it.key}
                  onClick={() => { setTab(it.key); setSidebarOpen(false); }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-smooth ${active
                    ? "gradient-brand text-primary-foreground shadow-brand"
                    : "hover:bg-muted/60 text-foreground"
                    }`}
                >
                  <Icon className="w-4 h-4" />
                  {it.label}
                </button>
              );
            })}
          </nav>

          <div className="absolute bottom-0 left-0 right-0 p-3 border-t border-border space-y-2 bg-background/80 backdrop-blur-md">
            <div className="px-3 pb-1 pt-1 flex items-center gap-2 text-[10px] text-muted-foreground">
              <img src="/avatar.png.PNG" alt="Maicon Show" className="w-6 h-6 rounded-full border border-primary/20 shadow-sm object-cover" />
              <span>Desenvolvido por <span className="font-semibold text-foreground">Michael Pithon </span> 👨🏽‍💻</span>
            </div>
            <div className="px-3 pb-2 text-xs text-muted-foreground truncate border-b border-border/50">{email}</div>
            <Link to="/tv" target="_blank">
              <Button variant="outline" size="sm" className="w-full justify-start">
                <Monitor className="w-4 h-4 mr-2" /> Abrir TV
              </Button>
            </Link>
            <Button variant="ghost" size="sm" onClick={handleLogout} className="w-full justify-start text-destructive">
              <LogOut className="w-4 h-4 mr-2" /> Sair
            </Button>
          </div>
        </aside>

        {/* Content */}
        <main className="flex-1 min-w-0 p-4 md:p-8">
          <div className="mb-4 flex justify-end">
            <Link to="/tv">
              <Button variant="outline" size="sm" className="hover:border-primary hover:text-primary">
                <Monitor className="w-4 h-4 mr-2" /> ← Sair para a TV
              </Button>
            </Link>
          </div>
          {tab === "dashboard" && <DashboardTab />}
          {tab === "ensalamento" && <EnsalamentoTab />}
          {tab === "auditorio" && <AuditorioTab />}
          {tab === "avisos" && <AvisosTab />}
          {tab === "professores" && <ProfessoresTab />}
          {tab === "disciplinas" && <DisciplinasTab />}
          {tab === "salas" && <SalasTab />}
          {tab === "horarios" && <HorariosTab />}
          {tab === "perfil" && <PerfilTab />}
          {tab === "admins" && isSuperAdmin && <AdminsTab currentUserId={userId} />}
          {tab === "settings" && isSuperAdmin && <SettingsTab />}
        </main>
      </div>
    </div>
  );
};

export default Admin;
