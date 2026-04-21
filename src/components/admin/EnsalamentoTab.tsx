import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
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
import { Plus, Pencil, Trash2, Loader2, Search } from "lucide-react";
import { toast } from "sonner";

type Ensalamento = {
  id: string; sala: string; bloco: string | null; turno: string; horario: string;
  professor: string | null;
  segunda: string | null; terca: string | null; quarta: string | null;
  quinta: string | null; sexta: string | null; sabado: string | null;
};

const empty: Omit<Ensalamento, "id"> = {
  sala: "", bloco: "", turno: "manha", horario: "", professor: "",
  segunda: "", terca: "", quarta: "", quinta: "", sexta: "", sabado: "",
};

const EnsalamentoTab = () => {
  const [rows, setRows] = useState<Ensalamento[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Ensalamento | null>(null);
  const [form, setForm] = useState(empty);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.from("ensalamento").select("*").order("turno").order("horario");
    if (error) toast.error("Erro ao carregar", { description: error.message });
    setRows((data as Ensalamento[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openNew = () => { setEditing(null); setForm(empty); setOpen(true); };
  const openEdit = (r: Ensalamento) => {
    setEditing(r);
    setForm({
      sala: r.sala, bloco: r.bloco ?? "", turno: r.turno, horario: r.horario,
      professor: r.professor ?? "",
      segunda: r.segunda ?? "", terca: r.terca ?? "", quarta: r.quarta ?? "",
      quinta: r.quinta ?? "", sexta: r.sexta ?? "", sabado: r.sabado ?? "",
    });
    setOpen(true);
  };

  const handleSave = async () => {
    if (!form.sala || !form.horario || !form.turno) { toast.error("Preencha sala, turno e horário"); return; }
    const payload = {
      ...form,
      bloco: form.bloco || null, professor: form.professor || null,
      segunda: form.segunda || null, terca: form.terca || null, quarta: form.quarta || null,
      quinta: form.quinta || null, sexta: form.sexta || null, sabado: form.sabado || null,
    };
    const { error } = editing
      ? await supabase.from("ensalamento").update(payload).eq("id", editing.id)
      : await supabase.from("ensalamento").insert(payload);
    if (error) { toast.error("Erro ao salvar", { description: error.message }); return; }
    toast.success(editing ? "Atualizado" : "Criado");
    setOpen(false); load();
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from("ensalamento").delete().eq("id", deleteId);
    if (error) { toast.error("Erro ao excluir", { description: error.message }); return; }
    toast.success("Excluído"); setDeleteId(null); load();
  };

  const filtered = rows.filter((r) => {
    const q = search.toLowerCase();
    if (!q) return true;
    return r.sala.toLowerCase().includes(q)
      || (r.professor ?? "").toLowerCase().includes(q)
      || (r.bloco ?? "").toLowerCase().includes(q)
      || r.horario.toLowerCase().includes(q);
  });

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold">Ensalamento</h2>
          <p className="text-muted-foreground text-sm">{rows.length} aula{rows.length === 1 ? "" : "s"} cadastrada{rows.length === 1 ? "" : "s"}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar sala, professor..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 w-64"
            />
          </div>
          <Button onClick={openNew} className="gradient-brand border-0 shadow-brand">
            <Plus className="w-4 h-4 mr-2" /> Nova Aula
          </Button>
        </div>
      </div>

      <div className="glass-card overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Sala</TableHead>
                <TableHead>Bloco</TableHead>
                <TableHead>Turno</TableHead>
                <TableHead>Horário</TableHead>
                <TableHead>Professor</TableHead>
                <TableHead>Seg</TableHead>
                <TableHead>Ter</TableHead>
                <TableHead>Qua</TableHead>
                <TableHead>Qui</TableHead>
                <TableHead>Sex</TableHead>
                <TableHead>Sáb</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={12} className="text-center py-12">
                  <Loader2 className="w-5 h-5 animate-spin inline" />
                </TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={12} className="text-center py-12 text-muted-foreground">
                  Nenhum registro
                </TableCell></TableRow>
              ) : filtered.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-semibold">{r.sala}</TableCell>
                  <TableCell>{r.bloco ?? "—"}</TableCell>
                  <TableCell className="capitalize">{r.turno}</TableCell>
                  <TableCell className="tabular-nums">{r.horario}</TableCell>
                  <TableCell>{r.professor ?? "—"}</TableCell>
                  <TableCell className="text-xs max-w-32 truncate">{r.segunda ?? "—"}</TableCell>
                  <TableCell className="text-xs max-w-32 truncate">{r.terca ?? "—"}</TableCell>
                  <TableCell className="text-xs max-w-32 truncate">{r.quarta ?? "—"}</TableCell>
                  <TableCell className="text-xs max-w-32 truncate">{r.quinta ?? "—"}</TableCell>
                  <TableCell className="text-xs max-w-32 truncate">{r.sexta ?? "—"}</TableCell>
                  <TableCell className="text-xs max-w-32 truncate">{r.sabado ?? "—"}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="icon" variant="ghost" onClick={() => openEdit(r)}>
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => setDeleteId(r.id)} className="text-destructive">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto glass-strong">
          <DialogHeader><DialogTitle>{editing ? "Editar aula" : "Nova aula"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-2">
            <div className="space-y-2"><Label>Sala *</Label><Input value={form.sala} onChange={(e) => setForm({ ...form, sala: e.target.value })} placeholder="Ex: 101" /></div>
            <div className="space-y-2"><Label>Bloco</Label><Input value={form.bloco ?? ""} onChange={(e) => setForm({ ...form, bloco: e.target.value })} placeholder="Ex: A" /></div>
            <div className="space-y-2">
              <Label>Turno *</Label>
              <Select value={form.turno} onValueChange={(v) => setForm({ ...form, turno: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="manha">Manhã</SelectItem>
                  <SelectItem value="tarde">Tarde</SelectItem>
                  <SelectItem value="noite">Noite</SelectItem>
                  <SelectItem value="integral">Integral</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>Horário * (ex: 08:00-10:00)</Label><Input value={form.horario} onChange={(e) => setForm({ ...form, horario: e.target.value })} placeholder="08:00-10:00" /></div>
            <div className="space-y-2 md:col-span-2"><Label>Professor</Label><Input value={form.professor ?? ""} onChange={(e) => setForm({ ...form, professor: e.target.value })} /></div>
            {(["segunda", "terca", "quarta", "quinta", "sexta", "sabado"] as const).map((d) => (
              <div key={d} className="space-y-2">
                <Label className="capitalize">{d === "terca" ? "Terça" : d === "sabado" ? "Sábado" : d}</Label>
                <Input value={(form as any)[d] ?? ""} onChange={(e) => setForm({ ...form, [d]: e.target.value } as any)} placeholder="Disciplina" />
              </div>
            ))}
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
            <AlertDialogTitle>Excluir esta aula?</AlertDialogTitle>
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

export default EnsalamentoTab;
