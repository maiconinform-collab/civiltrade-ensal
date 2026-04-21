import { useEffect, useState, ReactNode } from "react";
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
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";

export type FieldDef = {
  key: string;
  label: string;
  type?: "text" | "number" | "email" | "time";
  required?: boolean;
  placeholder?: string;
};

type AnyRow = { id: string; [k: string]: any };

type Props = {
  title: string;
  description?: string;
  table: "professores" | "disciplinas" | "salas" | "horarios";
  fields: FieldDef[];
  columns: { key: string; label: string; render?: (v: any) => ReactNode }[];
  emptyForm: Record<string, any>;
};

export function CrudTab({
  title, description, table, fields, columns, emptyForm,
}: Props) {
  const [rows, setRows] = useState<AnyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [form, setForm] = useState<Record<string, any>>(emptyForm);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.from(table).select("*").order("created_at", { ascending: false });
    if (error) toast.error("Erro ao carregar", { description: error.message });
    setRows((data as Row[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [table]); // eslint-disable-line

  const openNew = () => { setEditing(null); setForm(emptyForm); setOpen(true); };
  const openEdit = (r: Row) => {
    setEditing(r);
    const f: Record<string, any> = { ...emptyForm };
    fields.forEach((fd) => { f[fd.key] = (r as any)[fd.key] ?? ""; });
    setForm(f); setOpen(true);
  };

  const handleSave = async () => {
    for (const fd of fields) {
      if (fd.required && !form[fd.key]) {
        toast.error(`Preencha: ${fd.label}`); return;
      }
    }
    setSaving(true);
    const payload: Record<string, any> = {};
    fields.forEach((fd) => {
      const v = form[fd.key];
      if (v === "" || v === undefined) payload[fd.key] = null;
      else if (fd.type === "number") payload[fd.key] = Number(v);
      else payload[fd.key] = v;
    });
    const { error } = editing
      ? await supabase.from(table).update(payload).eq("id", editing.id)
      : await supabase.from(table).insert(payload);
    setSaving(false);
    if (error) { toast.error("Erro ao salvar", { description: error.message }); return; }
    toast.success(editing ? "Atualizado" : "Criado");
    setOpen(false); load();
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from(table).delete().eq("id", deleteId);
    if (error) { toast.error("Erro ao excluir", { description: error.message }); return; }
    toast.success("Excluído"); setDeleteId(null); load();
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold">{title}</h2>
          {description && <p className="text-muted-foreground text-sm">{description}</p>}
          <p className="text-xs text-muted-foreground mt-1">{rows.length} registro{rows.length === 1 ? "" : "s"}</p>
        </div>
        <Button onClick={openNew} className="gradient-brand border-0 shadow-brand">
          <Plus className="w-4 h-4 mr-2" /> Novo
        </Button>
      </div>

      <div className="glass-card overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {columns.map((c) => <TableHead key={c.key}>{c.label}</TableHead>)}
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={columns.length + 1} className="text-center py-12">
                  <Loader2 className="w-5 h-5 animate-spin inline" />
                </TableCell></TableRow>
              ) : rows.length === 0 ? (
                <TableRow><TableCell colSpan={columns.length + 1} className="text-center py-12 text-muted-foreground">
                  Nenhum registro
                </TableCell></TableRow>
              ) : rows.map((r) => (
                <TableRow key={r.id}>
                  {columns.map((c) => (
                    <TableCell key={c.key}>
                      {c.render ? c.render((r as any)[c.key]) : ((r as any)[c.key] ?? "—")}
                    </TableCell>
                  ))}
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
        <DialogContent className="glass-strong">
          <DialogHeader>
            <DialogTitle>{editing ? `Editar ${title.slice(0, -1).toLowerCase()}` : `Novo ${title.slice(0, -1).toLowerCase()}`}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-2">
            {fields.map((fd) => (
              <div key={fd.key} className={`space-y-2 ${fields.length % 2 !== 0 && fd.key === fields[fields.length - 1].key ? "md:col-span-2" : ""}`}>
                <Label>{fd.label}{fd.required && " *"}</Label>
                <Input
                  type={fd.type ?? "text"}
                  placeholder={fd.placeholder}
                  value={form[fd.key] ?? ""}
                  onChange={(e) => setForm({ ...form, [fd.key]: e.target.value })}
                />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving} className="gradient-brand border-0">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : (editing ? "Salvar" : "Criar")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(v) => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir este registro?</AlertDialogTitle>
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
}
