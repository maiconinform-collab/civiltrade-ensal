import { useEffect, useState, useMemo } from "react";
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
import { normalizeSearch, statusFor, parseHorario } from "@/lib/ensalamento-utils";

type Ensalamento = {
  id: string; sala: string; bloco: string | null; turno: string; horario: string;
  professor: string | null;
  segunda: string | null; terca: string | null; quarta: string | null;
  quinta: string | null; sexta: string | null; sabado: string | null;
};

type SalaOption = { id: string; nome: string; bloco: string | null };
type HorarioOption = { id: string; turno: string; hora_inicio: string; hora_fim: string };

const empty: Omit<Ensalamento, "id"> = {
  sala: "", bloco: "", turno: "manha", horario: "", professor: "",
  segunda: "", terca: "", quarta: "", quinta: "", sexta: "", sabado: "",
};

const turnoLabels: Record<string, string> = {
  manha: "Manhã",
  tarde: "Tarde",
  noite: "Noite",
  integral: "Integral",
};

const EnsalamentoTab = () => {
  const [rows, setRows] = useState<Ensalamento[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Ensalamento | null>(null);
  const [form, setForm] = useState(empty);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [now, setNow] = useState(new Date());

  // Options from DB
  const [salasOptions, setSalasOptions] = useState<SalaOption[]>([]);
  const [horariosOptions, setHorariosOptions] = useState<HorarioOption[]>([]);

  // Custom input mode (when "Outro" is selected)
  const [salaCustom, setSalaCustom] = useState(false);
  const [horarioCustom, setHorarioCustom] = useState(false);

  // Update clock for live status
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000); // update every 30s
    return () => clearInterval(t);
  }, []);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.from("ensalamento").select("*").order("turno").order("horario");
    if (error) toast.error("Erro ao carregar", { description: error.message });
    setRows((data as Ensalamento[]) ?? []);
    setLoading(false);
  };

  const loadOptions = async () => {
    const [salasRes, horariosRes] = await Promise.all([
      supabase.from("salas").select("id, nome, bloco").order("nome"),
      supabase.from("horarios").select("id, turno, hora_inicio, hora_fim").order("turno").order("hora_inicio"),
    ]);
    setSalasOptions((salasRes.data as SalaOption[]) ?? []);
    setHorariosOptions((horariosRes.data as HorarioOption[]) ?? []);
  };

  useEffect(() => { load(); loadOptions(); }, []);

  const openNew = () => {
    setEditing(null);
    setForm(empty);
    setSalaCustom(false);
    setHorarioCustom(false);
    setOpen(true);
  };

  const openEdit = (r: Ensalamento) => {
    setEditing(r);
    setForm({
      sala: r.sala, bloco: r.bloco ?? "", turno: r.turno, horario: r.horario,
      professor: r.professor ?? "",
      segunda: r.segunda ?? "", terca: r.terca ?? "", quarta: r.quarta ?? "",
      quinta: r.quinta ?? "", sexta: r.sexta ?? "", sabado: r.sabado ?? "",
    });
    // Check if sala/horario exist in the options
    const salaExists = salasOptions.some((s) => s.nome === r.sala);
    setSalaCustom(!salaExists);
    const horarioExists = horariosOptions.some((h) => `${h.hora_inicio}-${h.hora_fim}` === r.horario);
    setHorarioCustom(!horarioExists);
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

  // Improved global search: sala, professor, disciplinas (all weekdays), turno
  // Case-insensitive and accent-insensitive
  const filtered = useMemo(() => {
    const q = normalizeSearch(search);
    if (!q) return rows;
    return rows.filter((r) => {
      const fields = [
        r.sala,
        r.professor ?? "",
        r.bloco ?? "",
        r.horario,
        turnoLabels[r.turno] ?? r.turno,
        r.segunda ?? "",
        r.terca ?? "",
        r.quarta ?? "",
        r.quinta ?? "",
        r.sexta ?? "",
        r.sabado ?? "",
      ];
      return fields.some((f) => normalizeSearch(f).includes(q));
    });
  }, [rows, search]);

  // Handle sala selection from Select
  const handleSalaSelect = (value: string) => {
    if (value === "__custom__") {
      setSalaCustom(true);
      setForm({ ...form, sala: "", bloco: "" });
      return;
    }
    setSalaCustom(false);
    const sala = salasOptions.find((s) => s.nome === value);
    if (sala) {
      setForm({ ...form, sala: sala.nome, bloco: sala.bloco ?? "" });
    }
  };

  // Handle horario selection from Select
  const handleHorarioSelect = (value: string) => {
    if (value === "__custom__") {
      setHorarioCustom(true);
      setForm({ ...form, horario: "" });
      return;
    }
    setHorarioCustom(false);
    setForm({ ...form, horario: value });
  };

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
              placeholder="Buscar sala, professor, disciplina, turno..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 w-72"
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
                <TableHead>Status</TableHead>
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
                <TableRow><TableCell colSpan={13} className="text-center py-12">
                  <Loader2 className="w-5 h-5 animate-spin inline" />
                </TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={13} className="text-center py-12 text-muted-foreground">
                  Nenhum registro
                </TableCell></TableRow>
              ) : filtered.map((r) => {
                const st = statusFor(r.horario, now);
                const isLive = st === "now";
                return (
                  <TableRow key={r.id} className={isLive ? "bg-primary/5" : ""}>
                    <TableCell>
                      {isLive ? (
                        <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase text-destructive">
                          <span className="live-dot" />
                          Ao vivo
                        </span>
                      ) : st === "next" ? (
                        <span className="text-[10px] font-bold uppercase text-secondary">Próxima</span>
                      ) : st === "done" ? (
                        <span className="text-[10px] uppercase text-muted-foreground">Encerrada</span>
                      ) : (
                        <span className="text-[10px] uppercase text-muted-foreground">Agendada</span>
                      )}
                    </TableCell>
                    <TableCell className="font-semibold">{r.sala}</TableCell>
                    <TableCell>{r.bloco ?? "—"}</TableCell>
                    <TableCell className="capitalize">{turnoLabels[r.turno] ?? r.turno}</TableCell>
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
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto glass-strong">
          <DialogHeader><DialogTitle>{editing ? "Editar aula" : "Nova aula"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-2">
            {/* Sala — Select from DB or custom */}
            <div className="space-y-2">
              <Label>Sala *</Label>
              {!salaCustom && salasOptions.length > 0 ? (
                <Select value={form.sala} onValueChange={handleSalaSelect}>
                  <SelectTrigger><SelectValue placeholder="Selecione uma sala" /></SelectTrigger>
                  <SelectContent>
                    {salasOptions.map((s) => (
                      <SelectItem key={s.id} value={s.nome}>
                        {s.nome}{s.bloco ? ` (Bloco ${s.bloco})` : ""}
                      </SelectItem>
                    ))}
                    <SelectItem value="__custom__">✏️ Digitar manualmente...</SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <div className="flex gap-2">
                  <Input value={form.sala} onChange={(e) => setForm({ ...form, sala: e.target.value })} placeholder="Ex: 701" className="flex-1" />
                  {salasOptions.length > 0 && (
                    <Button variant="outline" size="sm" onClick={() => setSalaCustom(false)} className="text-xs whitespace-nowrap">
                      Selecionar
                    </Button>
                  )}
                </div>
              )}
            </div>

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

            {/* Horário — Select from DB or custom */}
            <div className="space-y-2">
              <Label>Horário *</Label>
              {!horarioCustom && horariosOptions.length > 0 ? (
                <Select value={form.horario} onValueChange={handleHorarioSelect}>
                  <SelectTrigger><SelectValue placeholder="Selecione um horário" /></SelectTrigger>
                  <SelectContent>
                    {horariosOptions.map((h) => {
                      const val = `${h.hora_inicio}-${h.hora_fim}`;
                      return (
                        <SelectItem key={h.id} value={val}>
                          {val} ({turnoLabels[h.turno] ?? h.turno})
                        </SelectItem>
                      );
                    })}
                    <SelectItem value="__custom__">✏️ Digitar manualmente...</SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <div className="flex gap-2">
                  <Input value={form.horario} onChange={(e) => setForm({ ...form, horario: e.target.value })} placeholder="08:00-10:00" className="flex-1" />
                  {horariosOptions.length > 0 && (
                    <Button variant="outline" size="sm" onClick={() => setHorarioCustom(false)} className="text-xs whitespace-nowrap">
                      Selecionar
                    </Button>
                  )}
                </div>
              )}
            </div>

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
