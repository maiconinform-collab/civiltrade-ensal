/**
 * Utilitários compartilhados do sistema de Ensalamento.
 * Funções reutilizáveis entre TVKiosk, Admin e outros componentes.
 */

/* ── Parser de horário ─────────────────────────────── */

export const parseHorario = (h: string, singleTimeDurationMinutes = 60) => {
  const rangeMatch = h.match(/(\d{1,2}):?(\d{2})\s*[-–]\s*(\d{1,2}):?(\d{2})/);
  if (rangeMatch) {
    return {
      start: parseInt(rangeMatch[1]) * 60 + parseInt(rangeMatch[2]),
      end: parseInt(rangeMatch[3]) * 60 + parseInt(rangeMatch[4]),
    };
  }

  // Suporte para horário pontual (ex: "08:53").
  // Assumimos 60 minutos de duração para permitir status "ao vivo".
  const singleMatch = h.match(/\b(\d{1,2}):(\d{2})\b/);
  if (singleMatch) {
    const start = parseInt(singleMatch[1]) * 60 + parseInt(singleMatch[2]);
    return { start, end: start + singleTimeDurationMinutes };
  }

  return null;
};

/* ── Status da aula ────────────────────────────────── */

export type Status = "now" | "next" | "scheduled" | "done";

export const statusFor = (h: string, now: Date, singleTimeDurationMinutes = 60): Status => {
  const p = parseHorario(h, singleTimeDurationMinutes);
  if (!p) return "scheduled";

  // Força o cálculo baseado no fuso de Brasília, ignorando a configuração local do dispositivo
  const options = { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hour12: false } as const;
  const spTimeStr = now.toLocaleTimeString('pt-BR', options);
  const [hStr, mStr] = spTimeStr.split(':');
  const minutes = parseInt(hStr, 10) * 60 + parseInt(mStr, 10);

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

/**
 * Detecta o turno automaticamente baseado no horário real da aula.
 * Manhã: início antes das 12h
 * Tarde: início entre 12h e 17h59
 * Noite: início a partir das 18h
 * Fallback: usa o campo `turno` do banco se o horário não puder ser parseado.
 */
export const detectTurno = (horario: string, turnoDb: string): string => {
  const p = parseHorario(horario);
  if (!p) return turnoDb; // fallback
  const startHour = Math.floor(p.start / 60);
  if (startHour < 12) return "manha";
  if (startHour < 18) return "tarde";
  return "noite";
};

export const getTurnoBadge = (turno: string, horario?: string): TurnoBadge => {
  const effective = horario ? detectTurno(horario, turno) : turno;
  const t = effective.toLowerCase().trim();
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

/* ── Captura Dia e Turno Real em Tempo Real ───────── */

export const getCurrentTurno = (date: Date = new Date()): string => {
  const options = { timeZone: 'America/Sao_Paulo', hour: '2-digit', hour12: false } as const;
  const spHourStr = date.toLocaleTimeString('pt-BR', options).split(':')[0];
  const currentHour = parseInt(spHourStr, 10);

  if (currentHour < 12) return "manha";
  if (currentHour < 18) return "tarde";
  return "noite";
};

export const getCurrentDayAndTurno = (date: Date = new Date()) => {
  return {
    day: dayKey(date),
    turno: getCurrentTurno(date)
  };
};

/* ── Exportação CSV (compatível Excel BR) ─────────── */

type EnsalamentoRow = {
  sala: string;
  bloco: string | null;
  turno: string;
  horario: string;
  professor: string | null;
  data?: string | null;
  segunda: string | null;
  terca: string | null;
  quarta: string | null;
  quinta: string | null;
  sexta: string | null;
  sabado: string | null;
  [key: string]: any;
};

/**
 * Gera e faz download de um CSV com delimitador ';' (padrão Excel BR).
 * SEGURANÇA MULTI-TENANT: filtra estritamente por unidade antes de exportar.
 *
 * @param rows   Todas as linhas da tabela já carregadas do banco
 * @param unidade Identificador da unidade ativa (ex: 'trade', 'patamares')
 */
export const exportToCSV = (rows: EnsalamentoRow[], unidade: string): void => {
  // Multi-tenant guard: só exporta registros que pertencem à unidade ativa
  const safeRows = rows.filter((r) => !r.unidade || r.unidade === unidade);

  const headers = [
    "sala", "bloco", "turno", "horario", "professor", "data",
    "segunda", "terca", "quarta", "quinta", "sexta", "sabado",
  ];

  const escapeCell = (val: string | null | undefined): string => {
    if (val === null || val === undefined) return "";
    const str = String(val);
    // Envolve em aspas duplas se contiver ';', '"' ou quebra de linha
    if (str.includes(";") || str.includes('"') || str.includes("\n")) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const headerLine = headers.join(";");
  const dataLines = safeRows.map((row) =>
    headers.map((h) => escapeCell(row[h])).join(";")
  );

  const csvContent = [headerLine, ...dataLines].join("\r\n");

  // Adiciona BOM UTF-8 para garantir exibição correta no Excel
  const bom = "\uFEFF";
  const blob = new Blob([bom + csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const today = new Date().toISOString().slice(0, 10);
  const fileName = `ENSALAMENTO_${unidade.toUpperCase()}_${today}.csv`;

  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", fileName);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};
