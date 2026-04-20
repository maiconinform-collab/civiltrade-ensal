import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Plus, UserPlus, Mail } from "lucide-react";
import { toast } from "sonner";

type Profile = {
  id: string;
  email: string;
  nome: string;
  role: string | null;
  status: string | null;
  created_at: string | null;
};

const AdminUsers = () => {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [nome, setNome] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("user_profiles")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) toast.error("Erro ao carregar", { description: error.message });
    else setProfiles((data as Profile[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const handleAdd = async () => {
    if (!email || !nome) {
      toast.error("Preencha nome e e-mail");
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("user_profiles")
      .insert({ email, nome, role: "admin", status: "pending" });
    setSaving(false);
    if (error) {
      toast.error("Erro", { description: error.message });
      return;
    }
    toast.success("Administrador adicionado", {
      description: "Peça para o usuário se cadastrar no Supabase com este e-mail.",
    });
    setEmail("");
    setNome("");
    setOpen(false);
    load();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Administradores</h2>
          <p className="text-muted-foreground text-sm">
            Pessoas com acesso ao painel administrativo
          </p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <UserPlus className="w-4 h-4 mr-2" />
          Adicionar Admin
        </Button>
      </div>

      <div className="bg-primary-soft border border-primary/20 rounded-xl p-4 flex gap-3">
        <Mail className="w-5 h-5 text-primary shrink-0 mt-0.5" />
        <div className="text-sm">
          <p className="font-semibold text-foreground mb-1">Como funciona o acesso</p>
          <p className="text-muted-foreground">
            Adicionar um administrador aqui registra o e-mail dele como autorizado.
            O cadastro de usuário (com senha) deve ser feito pelo painel do Supabase em
            <span className="font-mono mx-1">Authentication → Users</span>
            ou por convite via e-mail.
          </p>
        </div>
      </div>

      <div className="bg-card rounded-2xl border border-border overflow-hidden shadow-soft">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              <TableHead>Nome</TableHead>
              <TableHead>E-mail</TableHead>
              <TableHead>Função</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Cadastrado em</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                  Carregando...
                </TableCell>
              </TableRow>
            ) : profiles.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                  Nenhum administrador cadastrado
                </TableCell>
              </TableRow>
            ) : (
              profiles.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-semibold">{p.nome}</TableCell>
                  <TableCell>{p.email}</TableCell>
                  <TableCell className="capitalize">{p.role}</TableCell>
                  <TableCell>
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      p.status === "active"
                        ? "bg-success/10 text-success"
                        : "bg-warning/10 text-warning"
                    }`}>
                      {p.status === "active" ? "Ativo" : "Pendente"}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {p.created_at ? new Date(p.created_at).toLocaleDateString("pt-BR") : "—"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adicionar administrador</DialogTitle>
            <DialogDescription>
              Registre um novo administrador. O usuário deve ser criado também no Supabase Auth.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome completo" />
            </div>
            <div className="space-y-2">
              <Label>E-mail</Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@afya.edu.br"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={handleAdd} disabled={saving}>
              <Plus className="w-4 h-4 mr-2" />
              Adicionar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminUsers;
