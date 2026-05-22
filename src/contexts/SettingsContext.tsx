import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

type Settings = {
  brand_name: string;
  unit_name: string;
  logo_url: string;
  primary_color: string;   // HSL "h s% l%"
  secondary_color: string;
  single_time_duration_minutes: number;
};

const DEFAULTS: Settings = {
  brand_name: "Afya",
  unit_name: "Ensalamento Civil Trade",
  logo_url: "",
  primary_color: "336 78% 56%",
  secondary_color: "280 65% 55%",
  single_time_duration_minutes: 60,
};

type Ctx = {
  settings: Settings;
  reload: () => Promise<void>;
};
const SettingsContext = createContext<Ctx>({ settings: DEFAULTS, reload: async () => {} });

export const useSettings = () => useContext(SettingsContext);

const applyCssVars = (s: Settings) => {
  const root = document.documentElement;
  if (s.primary_color) root.style.setProperty("--primary", s.primary_color);
  if (s.secondary_color) root.style.setProperty("--secondary", s.secondary_color);
};

export const SettingsProvider = ({ children }: { children: ReactNode }) => {
  const [settings, setSettings] = useState<Settings>(DEFAULTS);

  const load = async () => {
    const { data } = await supabase.from("settings").select("key, value");
    if (!data) return;
    const next: Settings = { ...DEFAULTS };
    for (const row of data as Array<{ key: string; value: unknown }>) {
      if (!(row.key in next)) continue;
      if (row.key === "single_time_duration_minutes") {
        const parsed = Number(row.value);
        (next as any)[row.key] = Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULTS.single_time_duration_minutes;
        continue;
      }
      const v = row.value as string;
      (next as any)[row.key] = v ?? "";
    }
    setSettings(next);
    applyCssVars(next);
    if (next.brand_name) document.title = `${next.brand_name} — Ensalamento`;
  };

  useEffect(() => {
    load();
    const channel = supabase
      .channel("settings-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "settings" },
        () => load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <SettingsContext.Provider value={{ settings, reload: load }}>
      {children}
    </SettingsContext.Provider>
  );
};
