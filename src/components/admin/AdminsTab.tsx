import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2, Plus, Trash2, Shield, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

type AdminUser = {
  user_id: string;
  email: string;
  role: "super_admin" | "admin";
  created_at: string;
  last_sign_in_at: string | null;
};

const AdminsTab = ({ currentUserId }: { currentUserId: string | null }) => {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"admin" | "super_admin">("admin");
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.functions.invoke("admin-list-users");
    if (error) toast.error("Erro ao listar", { description: error.message });
    setUsers((data as any)?.users ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    if (!email || !password) { toast.error("Preencha e-mail e senha"); return; }
    if (password.length < 8) { toast.error("Senha deve ter no mínimo 8 caracteres"); return; }
    setSaving(true);
    const { data, error } = await supabase.functions.invoke("admin-create-user", {
      body: { email, password, role },
    });
    setSaving(false);
    if (error || (data as any)?.error) {
      toast.error("Erro ao criar", { description: (data as any)?.error ?? error?.message });
      return;
    }
    toast.success("Administrador criado");
    setEmail(""); setPassword(""); setRole("admin"); setOpen(false); load();
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const { data, error } = await supabase.functions.invoke("admin-delete-user", {
      body: { user_id: deleteId },
    });
    if (error || (data as any)?.error) {
      toast.error("Erro ao remover", { description: (data as any)?.error ?? error?.message });
      return;
    }
    toast.success("Removido");
    setDeleteId(null); load();
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold">Administradores</h2>
          <p className="text-muted-foreground text-sm">Apenas Super Admin pode gerenciar</p>
        </div>
        <Button onClick={() => setOpen(true)} className="gradient-brand border-0 shadow-brand">
          <Plus className="w-4 h-4 mr-2" /> Novo admin
        </Button>
      </div>

      <div className="glass-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>E-mail</TableHead>
              <TableHead>Papel</TableHead>
              <TableHead>Último acesso</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={4} className="text-center py-12">
                <Loader2 className="w-5 h-5 animate-spin inline" />
              </TableCell></TableRow>
            ) : users.length === 0 ? (
              <TableRow><TableCell colSpan={4} className="text-center py-12 text-muted-foreground">
                Nenhum administrador
              </TableCell></TableRow>
            ) : users.map((u) => (
              <TableRow key={u.user_id}>
                <TableCell className="font-medium">
                  {u.email}
                  {u.user_id === currentUserId && (
                    <span className="ml-2 text-xs text-muted-foreground">(você)</span>
                  )}
                </TableCell>
                <TableCell>
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary">
                    {u.role === "super_admin" ? <ShieldCheck className="w-3 h-3" /> : <Shield className="w-3 h-3" />}
                    {u.role === "super_admin" ? "Super Admin" : "Admin"}
                  </span>
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleString("pt-BR") : "—"}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    size="icon"
                    variant="ghost"
                    disabled={u.user_id === currentUserId}
                    onClick={() => setDeleteId(u.user_id)}
                    className="text-destructive disabled:opacity-30"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="glass-strong">
          <DialogHeader><DialogTitle>Novo administrador</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>E-mail</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="admin@afya.com" />
            </div>
            <div className="space-y-2">
              <Label>Senha provisória (mín. 8 caracteres)</Label>
              <Input type="text" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Senha123!" />
            </div>
            <div className="space-y-2">
              <Label>Papel</Label>
              <Select value={role} onValueChange={(v) => setRole(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="super_admin">Super Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreate} disabled={saving} className="gradient-brand border-0">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(v) => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover este administrador?</AlertDialogTitle>
            <AlertDialogDescription>O usuário será excluído permanentemente.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">Remover</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AdminsTab;
