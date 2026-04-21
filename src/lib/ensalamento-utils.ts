/**
 * Utilitários compartilhados do sistema de Ensalamento.
 * Funções reutilizáveis entre TVKiosk, Admin e outros componentes.
 */

/* ── Parser de horário ─────────────────────────────── */

export const parseHorario = (h: string) => {
  const m = h.match(/(\d{1,2}):?(\d{2})\s*[-–]\s*(\d{1,2}):?(\d{2})/);
  if (!m) return null;
  return {
    start: parseInt(m[1]) * 60 + parseInt(m[2]),
    end: parseInt(m[3]) * 60 + parseInt(m[4]),
  };
};

/* ── Status da aula ────────────────────────────────── */

export type Status = "now" | "next" | "scheduled" | "done";

export const statusFor = (h: string, now: Date): Status => {
  const p = parseHorario(h);
  if (!p) return "scheduled";
  const minutes = now.getHours() * 60 + now.getMinutes();
  if (minutes >= p.start && minutes < p.end) return "now";
  if (minutes < p.start) return p.start - minutes <= 60 ? "next" : "scheduled";
  return "done";
};

export const statusRank: Record<Status, number> = { now: 0, next: 1, scheduled: 2, done: 3 };

/* ── Dia da semana ─────────────────────────────────── */

export const dayKey = (d: Date) => {
  const idx = d.getDay();
  if (idx === 0) return null;
  return ["", "segunda", "terca", "quarta", "quinta", "sexta", "sabado"][idx];
};

/* ── Lógica de Andar ───────────────────────────────── */

export const getAndar = (sala: string): string | null => {
  const match = sala.match(/(\d)/);
  if (!match) return null;
  const digit = parseInt(match[1]);
  if (digit === 0) return null;
  return `${digit}º Andar`;
};

export const getAndarNumero = (sala: string): number | null => {
  const match = sala.match(/(\d)/);
  if (!match) return null;
  const digit = parseInt(match[1]);
  return digit === 0 ? null : digit;
};

/* ── Badge de Turno ────────────────────────────────── */

export type TurnoBadge = {
  label: string;
  emoji: string;
  className: string;
};

export const getTurnoBadge = (turno: string): TurnoBadge => {
  const t = turno.toLowerCase().trim();
  if (t === "manha" || t === "manhã") {
    return { label: "Manhã", emoji: "☀️", className: "badge-manha" };
  }
  if (t === "tarde") {
    return { label: "Tarde", emoji: "🌤️", className: "badge-tarde" };
  }
  if (t === "noite") {
    return { label: "Noite", emoji: "🌙", className: "badge-noite" };
  }
  if (t === "integral") {
    return { label: "Integral", emoji: "📚", className: "badge-integral" };
  }
  return { label: turno, emoji: "📖", className: "badge-manha" };
};

/* ── Normalização de busca (remove acentos + lowercase) ── */

export const normalizeSearch = (text: string): string => {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
};

/* ── Extrair número da sala para ordenação ─────────── */

export const salaToNumber = (sala: string): number => {
  const match = sala.match(/(\d+)/);
  return match ? parseInt(match[1]) : 9999;
};
