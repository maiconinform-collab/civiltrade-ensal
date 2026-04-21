import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2, Loader2, Megaphone } from "lucide-react";
import { toast } from "sonner";

type Aviso = { id: string; texto: string; ativo: boolean; ordem: number };

const AvisosTab = () => {
  const [rows, setRows] = useState<Aviso[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Aviso | null>(null);
  const [form, setForm] = useState({ texto: "", ativo: true, ordem: 0 });
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.from("avisos").select("*").order("ordem").order("created_at", { ascending: false });
    if (error) toast.error("Erro ao carregar", { description: error.message });
    setRows((data as Aviso[]) ?? []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const openNew = () => { setEditing(null); setForm({ texto: "", ativo: true, ordem: 0 }); setOpen(true); };
  const openEdit = (r: Aviso) => { setEditing(r); setForm({ texto: r.texto, ativo: r.ativo, ordem: r.ordem }); setOpen(true); };

  const handleSave = async () => {
    if (!form.texto.trim()) { toast.error("Digite o texto do aviso"); return; }
    const payload = { texto: form.texto.trim(), ativo: form.ativo, ordem: Number(form.ordem) || 0 };
    const { error } = editing
      ? await supabase.from("avisos").update(payload).eq("id", editing.id)
      : await supabase.from("avisos").insert(payload);
    if (error) { toast.error("Erro ao salvar", { description: error.message }); return; }
    toast.success(editing ? "Atualizado" : "Criado");
    setOpen(false); load();
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from("avisos").delete().eq("id", deleteId);
    if (error) { toast.error("Erro ao excluir", { description: error.message }); return; }
    toast.success("Excluído"); setDeleteId(null); load();
  };

  const toggleAtivo = async (r: Aviso) => {
    const { error } = await supabase.from("avisos").update({ ativo: !r.ativo }).eq("id", r.id);
    if (error) toast.error("Erro", { description: error.message });
    else load();
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2"><Megaphone className="w-6 h-6 text-primary" /> Avisos</h2>
          <p className="text-muted-foreground text-sm">
            Mensagens que rolam no rodapé da TV. Use ordem para priorizar.
          </p>
        </div>
        <Button onClick={openNew} className="gradient-brand border-0 shadow-brand">
          <Plus className="w-4 h-4 mr-2" /> Novo aviso
        </Button>
      </div>

      <div className="glass-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-20">Ordem</TableHead>
              <TableHead>Texto</TableHead>
              <TableHead className="w-24">Ativo</TableHead>
              <TableHead className="text-right w-32">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={4} className="text-center py-12"><Loader2 className="w-5 h-5 animate-spin inline" /></TableCell></TableRow>
            ) : rows.length === 0 ? (
              <TableRow><TableCell colSpan={4} className="text-center py-12 text-muted-foreground">Nenhum aviso cadastrado</TableCell></TableRow>
            ) : rows.map((r) => (
              <TableRow key={r.id} className={r.ativo ? "" : "opacity-50"}>
                <TableCell className="tabular-nums">{r.ordem}</TableCell>
                <TableCell className="max-w-xl">{r.texto}</TableCell>
                <TableCell><Switch checked={r.ativo} onCheckedChange={() => toggleAtivo(r)} /></TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button size="icon" variant="ghost" onClick={() => openEdit(r)}><Pencil className="w-4 h-4" /></Button>
                    <Button size="icon" variant="ghost" onClick={() => setDeleteId(r.id)} className="text-destructive"><Trash2 className="w-4 h-4" /></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="glass-strong">
          <DialogHeader><DialogTitle>{editing ? "Editar aviso" : "Novo aviso"}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Texto *</Label>
              <Textarea rows={3} value={form.texto} onChange={(e) => setForm({ ...form, texto: e.target.value })}
                placeholder="Ex: Inscrições abertas para o FIES até 30/04" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Ordem</Label>
                <Input type="number" value={form.ordem} onChange={(e) => setForm({ ...form, ordem: Number(e.target.value) })} />
              </div>
              <div className="space-y-2">
                <Label>Ativo</Label>
                <div className="h-10 flex items-center"><Switch checked={form.ativo} onCheckedChange={(v) => setForm({ ...form, ativo: v })} /></div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} className="gradient-brand border-0">{editing ? "Salvar" : "Criar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(v) => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir este aviso?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AvisosTab;
