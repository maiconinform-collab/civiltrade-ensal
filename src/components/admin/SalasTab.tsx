import { CrudTab } from "./CrudTab";

const SalasTab = ({ unidade }: { unidade: string }) => (
  <CrudTab
    unidade={unidade}
    table="salas"
    title="Salas"
    description="Cadastro de salas físicas"
    fields={[
      { key: "nome", label: "Nome/Número", required: true, placeholder: "Ex: 101" },
      { key: "bloco", label: "Bloco", placeholder: "Ex: A" },
      { key: "capacidade", label: "Capacidade", type: "number" },
      {
        key: "status",
        label: "Status",
        type: "select",
        options: [
          { value: "Livre", label: "Livre" },
          { value: "Ocupada", label: "Ocupada" },
          { value: "Manutenção", label: "Em Manutenção" },
          { value: "Defeito Ar", label: "Defeito no Ar" },
          { value: "Alagamento", label: "Alagamento" },
        ],
        required: true,
      },
    ]}
    columns={[
      { key: "nome", label: "Sala" },
      { key: "bloco", label: "Bloco" },
      { key: "capacidade", label: "Capacidade" },
      {
        key: "status",
        label: "Status",
        render: (val: string) => {
          const status = val || "Livre";
          const colors: Record<string, string> = {
            "Livre": "bg-green-500/10 text-green-500 border-green-500/20",
            "Ocupada": "bg-red-500/10 text-red-500 border-red-500/20",
            "Manutenção": "bg-purple-500/10 text-purple-500 border-purple-500/20",
            "Defeito Ar": "bg-amber-500/10 text-amber-500 border-amber-500/20",
            "Alagamento": "bg-blue-500/10 text-blue-500 border-blue-500/20",
          };
          const style = colors[status] || "bg-muted text-muted-foreground border-border";
          return (
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${style}`}>
              {status}
            </span>
          );
        }
      },
    ]}
    emptyForm={{ nome: "", bloco: "", capacidade: "", status: "Livre" }}
  />
);
export default SalasTab;
