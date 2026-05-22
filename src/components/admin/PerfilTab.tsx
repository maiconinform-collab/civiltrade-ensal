import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, User, KeyRound } from "lucide-react";
import { toast } from "sonner";

const PerfilTab = () => {
  const [loading, setLoading] = useState(true);
  const [savingNome, setSavingNome] = useState(false);
  const [savingSenha, setSavingSenha] = useState(false);
  const [email, setEmail] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [nome, setNome] = useState("");
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmSenha, setConfirmSenha] = useState("");

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }
      setEmail(user.email ?? "");
      setUserId(user.id);
      const { data } = await supabase.from("profiles").select("nome").eq("id", user.id).maybeSingle();
      setNome(data?.nome ?? "");
      setLoading(false);
    })();
  }, []);

  const salvarNome = async () => {
    if (!userId) return;
    setSavingNome(true);
    const { error } = await supabase.from("profiles").upsert({ id: userId, nome: nome.trim() || null });
    setSavingNome(false);
    if (error) { toast.error("Erro ao salvar nome", { description: error.message }); return; }
    toast.success("Nome atualizado");
  };

  const trocarSenha = async () => {
    if (novaSenha.length < 6) { toast.error("A senha deve ter pelo menos 6 caracteres"); return; }
    if (novaSenha !== confirmSenha) { toast.error("As senhas não coincidem"); return; }
    setSavingSenha(true);
    const { error } = await supabase.auth.updateUser({ password: novaSenha });
    setSavingSenha(false);
    if (error) { toast.error("Erro ao trocar senha", { description: error.message }); return; }
    toast.success("Senha alterada com sucesso");
    setNovaSenha(""); setConfirmSenha("");
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6 animate-fade-in max-w-2xl">
      <div>
        <h2 className="text-2xl font-bold flex items-center gap-2"><User className="w-6 h-6 text-primary" /> Meu Perfil</h2>
        <p className="text-muted-foreground text-sm">Atualize seu nome e senha de acesso.</p>
      </div>

      <div className="glass-card p-6 space-y-4">
        <h3 className="font-semibold">Dados pessoais</h3>
        <div className="space-y-2">
          <Label>E-mail</Label>
          <Input value={email} disabled />
        </div>
        <div className="space-y-2">
          <Label>Nome</Label>
          <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Seu nome" />
        </div>
        <Button onClick={salvarNome} disabled={savingNome} className="gradient-brand border-0">
          {savingNome ? <Loader2 className="w-4 h-4 animate-spin" /> : "Salvar nome"}
        </Button>
      </div>

      <div className="glass-card p-6 space-y-4">
        <h3 className="font-semibold flex items-center gap-2"><KeyRound className="w-4 h-4" /> Alterar senha</h3>
        <div className="space-y-2">
          <Label>Nova senha</Label>
          <Input type="password" value={novaSenha} onChange={(e) => setNovaSenha(e.target.value)} placeholder="Mínimo 6 caracteres" />
        </div>
        <div className="space-y-2">
          <Label>Confirmar nova senha</Label>
          <Input type="password" value={confirmSenha} onChange={(e) => setConfirmSenha(e.target.value)} />
        </div>
        <Button onClick={trocarSenha} disabled={savingSenha} className="gradient-brand border-0">
          {savingSenha ? <Loader2 className="w-4 h-4 animate-spin" /> : "Trocar senha"}
        </Button>
      </div>
    </div>
  );
};

export default PerfilTab;
