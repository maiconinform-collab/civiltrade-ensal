import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "super_admin" | "admin";

export const useUserRole = () => {
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState<string>("");
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const load = async (uid: string) => {
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", uid);
      if (!active) return;
      setRoles(((data ?? []) as { role: AppRole }[]).map((r) => r.role));
      setLoading(false);
    };

    supabase.auth.getSession().then(({ data }) => {
      const session = data.session;
      if (!session) {
        setLoading(false);
        return;
      }
      setUserId(session.user.id);
      setEmail(session.user.email ?? "");
      load(session.user.id);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (!session) {
        setUserId(null);
        setEmail("");
        setRoles([]);
        setLoading(false);
        return;
      }
      setUserId(session.user.id);
      setEmail(session.user.email ?? "");
      // defer to avoid deadlock per Supabase docs
      setTimeout(() => load(session.user.id), 0);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return {
    userId,
    email,
    roles,
    isAdmin: roles.includes("admin") || roles.includes("super_admin"),
    isSuperAdmin: roles.includes("super_admin"),
    loading,
  };
};
