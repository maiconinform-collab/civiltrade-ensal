/**
 * Este componente gerencia a tela de Autenticação (Login) do sistema.
 * 
 * Objetivo: Fornecer acesso seguro à área administrativa. Inclui funções de 
 * login e recuperação de senha, comunicando-se diretamente com o Supabase Auth.
 */

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, GraduationCap, User, Lock, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { useSettings } from "@/contexts/SettingsContext";
import { siteConfig } from "@/config/siteConfig";

const Login = () => {
  // --- VARIÁVEIS CRÍTICAS E ESTADOS ---
  const navigate = useNavigate(); // Hook para redirecionar o usuário
  const { settings } = useSettings(); // Configurações visuais (logo, nome, etc)
  const [email, setEmail] = useState(""); // E-mail digitado pelo usuário
  const [password, setPassword] = useState(""); // Senha digitada
  const [loading, setLoading] = useState(false); // Controle do estado de carregamento do botão

  // --- EFEITOS COLATERAIS (LIFECYCLE) ---
  // Verifica se o usuário já está logado. Se estiver, manda direto pro painel.

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate("/admin", { replace: true });
    });
  }, [navigate]);

  // --- FUNÇÕES DE AUTENTICAÇÃO ---
  // Realiza o login com email e senha usando Supabase
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      toast.error("Erro ao entrar", { description: error.message });
      return;
    }
    toast.success("Bem-vindo!");
    navigate("/admin", { replace: true });
  };

  // Solicita o e-mail de redefinição de senha
  const handleResetPassword = async () => {
    if (!email) {
      toast.error("Por favor, digite seu e-mail no campo acima primeiro.");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + "/admin",
    });
    setLoading(false);
    if (error) {
      toast.error("Erro ao enviar e-mail", { description: error.message });
      return;
    }
    toast.success("E-mail de recuperação enviado! Verifique sua caixa de entrada.");
  };

  // --- RENDERIZAÇÃO DA INTERFACE ---
  return (
    <div className="min-h-screen flex items-center justify-center px-6 gradient-mesh animate-mesh">
      <div className="w-full max-w-md animate-slide-up">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-3 mb-4 animate-float">
            {settings.logo_url ? (
              <img src={settings.logo_url} alt={settings.brand_name} className="w-14 h-14 rounded-2xl object-cover shadow-glow" />
            ) : (
              <div className="w-14 h-14 rounded-2xl gradient-brand flex items-center justify-center shadow-brand">
                <GraduationCap className="w-8 h-8 text-primary-foreground" />
              </div>
            )}
            <h1 className="text-5xl font-bold tracking-tight gradient-text">
              {settings.brand_name || "Afya"}
            </h1>
          </div>
          <p className="text-muted-foreground text-lg">{settings.unit_name}</p>
          <p className="text-xs text-muted-foreground mt-1">Acesso Administrativo</p>
        </div>

        <form onSubmit={handleLogin} className="glass-card p-8 space-y-5">
          <div className="space-y-2">
            <Label htmlFor="email">E-mail</Label>
            <Input
              id="email"
              type="email"
              placeholder="seu@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="bg-background/60"
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Senha</Label>
              <button
                type="button"
                onClick={handleResetPassword}
                className="text-xs text-primary hover:underline"
              >
                Esqueci a senha
              </button>
            </div>
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="bg-background/60"
            />
          </div>
          <Button
            type="submit"
            className="w-full h-12 text-base gradient-brand shadow-brand hover:opacity-95 transition-smooth border-0"
            disabled={loading}
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Entrar"}
          </Button>
        </form>

        <div className="mt-6 text-center">
          <a
            href="/"
            className="text-sm text-muted-foreground hover:text-primary transition-smooth inline-flex items-center gap-1"
          >
            ← Voltar para o Início
          </a>
        </div>

        <div className="flex items-center justify-center gap-3 mt-6">
          <img src={siteConfig.devAvatarUrl} alt={siteConfig.devName} className="w-8 h-8 rounded-full border border-primary/20 shadow-sm object-cover" />
          <p className="text-center text-sm text-muted-foreground">
            Desenvolvido por <span className="font-semibold text-foreground">{siteConfig.devName}</span> 👨🏽‍💻
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
