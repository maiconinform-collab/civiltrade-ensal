import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Plus, Pencil, Trash2, Loader2, Mic, Upload } from "lucide-react";
import * as XLSX from "xlsx";
import { toast } from "sonner";

type Evento = {
  id: string; nome: string; responsavel: string | null; descricao: string | null;
  inicio: string; fim: string; local: string | null;
};

const toLocalInput = (iso: string) => {
  // 'YYYY-MM-DDTHH:mm' for datetime-local input
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const empty = { nome: "", responsavel: "", descricao: "", inicio: "", fim: "", local: "Auditório Principal" };

const AuditorioTab = () => {
  const [rows, setRows] = useState<Evento[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Evento | null>(null);
  const [form, setForm] = useState(empty);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.from("auditorio_eventos").select("*").order("inicio", { ascending: true });
    if (error) toast.error("Erro ao carregar", { description: error.message });
    setRows((data as Evento[]) ?? []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const json = XLSX.utils.sheet_to_json(worksheet) as any[];

      const mappedRows = json.map((row) => {
        const normalizedRow: any = {};
        for (const key of Object.keys(row)) {
          const normKey = key.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
          normalizedRow[normKey] = row[key];
        }

        let inicio = new Date().toISOString();
        let fim = new Date(new Date().getTime() + 60*60*1000).toISOString(); // +1 hour
        
        // Se houver data/hora na planilha, tentamos parsear. Simplificação por agora:
        // Assume ISO ou confia no que vem, ou usa data atual.
        if (normalizedRow.inicio) {
           const parsed = new Date(normalizedRow.inicio);
           if (!isNaN(parsed.getTime())) inicio = parsed.toISOString();
        }
        if (normalizedRow.fim) {
           const parsed = new Date(normalizedRow.fim);
           if (!isNaN(parsed.getTime())) fim = parsed.toISOString();
        }

        return {
          nome: String(normalizedRow.nome || normalizedRow.evento || "Evento Sem Nome"),
          responsavel: normalizedRow.responsavel || null,
          descricao: normalizedRow.descricao || null,
          inicio,
          fim,
          local: normalizedRow.local || "Auditório Principal"
        };
      }).filter(r => r.nome !== "Evento Sem Nome");

      if (mappedRows.length === 0) {
        toast.error("Nenhum evento encontrado. Verifique as colunas (Nome/Evento).");
        setImporting(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }

      const { error } = await supabase.from("auditorio_eventos").insert(mappedRows);
      if (error) throw error;

      toast.success(`${mappedRows.length} eventos importados com sucesso!`);
      load();
    } catch (err: any) {
      toast.error("Erro ao importar", { description: err.message });
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const openNew = () => { setEditing(null); setForm(empty); setOpen(true); };
  const openEdit = (r: Evento) => {
    setEditing(r);
    setForm({
      nome: r.nome, responsavel: r.responsavel ?? "", descricao: r.descricao ?? "",
      inicio: toLocalInput(r.inicio), fim: toLocalInput(r.fim), local: r.local ?? "Auditório Principal",
    });
    setOpen(true);
  };

  const handleSave = async () => {
    if (!form.nome || !form.inicio || !form.fim) { toast.error("Preencha nome, início e fim"); return; }
    if (new Date(form.fim) <= new Date(form.inicio)) { toast.error("Fim deve ser depois do início"); return; }
    const payload = {
      nome: form.nome, responsavel: form.responsavel || null, descricao: form.descricao || null,
      inicio: new Date(form.inicio).toISOString(), fim: new Date(form.fim).toISOString(),
      local: form.local || null,
    };
    const { error } = editing
      ? await supabase.from("auditorio_eventos").update(payload).eq("id", editing.id)
      : await supabase.from("auditorio_eventos").insert(payload);
    if (error) { toast.error("Erro ao salvar", { description: error.message }); return; }
    toast.success(editing ? "Atualizado" : "Criado");
    setOpen(false); load();
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from("auditorio_eventos").delete().eq("id", deleteId);
    if (error) { toast.error("Erro ao excluir", { description: error.message }); return; }
    toast.success("Excluído"); setDeleteId(null); load();
  };

  const fmt = (iso: string) => new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2"><Mic className="w-6 h-6 text-primary" /> Agenda do Auditório</h2>
          <p className="text-muted-foreground text-sm">{rows.length} evento{rows.length === 1 ? "" : "s"} cadastrado{rows.length === 1 ? "" : "s"}</p>
        </div>
        <div className="flex gap-2">
          <input
            type="file"
            accept=".xlsx, .xls, .csv"
            className="hidden"
            ref={fileInputRef}
            onChange={handleFileUpload}
          />
          <Button
            onClick={() => fileInputRef.current?.click()}
            variant="outline"
            disabled={importing}
          >
            {importing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
            {importing ? "Importando..." : "Importar Planilha"}
          </Button>
          <Button onClick={openNew} className="gradient-brand border-0 shadow-brand">
            <Plus className="w-4 h-4 mr-2" /> Novo evento
          </Button>
        </div>
      </div>

      <div className="glass-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Evento</TableHead>
              <TableHead>Responsável</TableHead>
              <TableHead>Local</TableHead>
              <TableHead>Início</TableHead>
              <TableHead>Fim</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={6} className="text-center py-12"><Loader2 className="w-5 h-5 animate-spin inline" /></TableCell></TableRow>
            ) : rows.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center py-12 text-muted-foreground">Nenhum evento</TableCell></TableRow>
            ) : rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-semibold">{r.nome}</TableCell>
                <TableCell>{r.responsavel ?? "—"}</TableCell>
                <TableCell>{r.local ?? "—"}</TableCell>
                <TableCell className="tabular-nums">{fmt(r.inicio)}</TableCell>
                <TableCell className="tabular-nums">{fmt(r.fim)}</TableCell>
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
        <DialogContent className="max-w-2xl glass-strong">
          <DialogHeader><DialogTitle>{editing ? "Editar evento" : "Novo evento do auditório"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-2">
            <div className="space-y-2 md:col-span-2"><Label>Nome do evento *</Label><Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} /></div>
            <div className="space-y-2"><Label>Responsável</Label><Input value={form.responsavel} onChange={(e) => setForm({ ...form, responsavel: e.target.value })} /></div>
            <div className="space-y-2"><Label>Local</Label><Input value={form.local} onChange={(e) => setForm({ ...form, local: e.target.value })} /></div>
            <div className="space-y-2"><Label>Início *</Label><Input type="datetime-local" value={form.inicio} onChange={(e) => setForm({ ...form, inicio: e.target.value })} /></div>
            <div className="space-y-2"><Label>Fim *</Label><Input type="datetime-local" value={form.fim} onChange={(e) => setForm({ ...form, fim: e.target.value })} /></div>
            <div className="space-y-2 md:col-span-2"><Label>Descrição</Label><Textarea rows={3} value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} /></div>
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
            <AlertDialogTitle>Excluir este evento?</AlertDialogTitle>
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

export default AuditorioTab;
