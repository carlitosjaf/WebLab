"use client";

import { useMemo, useState } from "react";

type BudgetItem = {
  id: number;
  descricao: string;
  categoria: string;
  quantidade: number;
  valorUnitario: number;
  justificativa: string;
};

const initialItems: BudgetItem[] = [
  {
    id: 1,
    descricao: "Impressões e cópias",
    categoria: "Material de consumo",
    quantidade: 1,
    valorUnitario: 0,
    justificativa: "Apoio à documentação do projeto, quando necessário."
  },
  {
    id: 2,
    descricao: "Deslocamento para coleta de dados",
    categoria: "Serviços/locomoção",
    quantidade: 1,
    valorUnitario: 0,
    justificativa: "Custos previstos para atividades de campo ou reuniões vinculadas à pesquisa."
  },
  {
    id: 3,
    descricao: "Sem custos diretos previstos",
    categoria: "Sem financiamento",
    quantidade: 1,
    valorUnitario: 0,
    justificativa: "Projeto realizado com recursos institucionais já disponíveis."
  }
];

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    currency: "BRL",
    style: "currency"
  }).format(value);
}

function buildBudgetDraft(items: BudgetItem[]) {
  const validItems = items.filter((item) => item.descricao.trim());
  const total = validItems.reduce((sum, item) => sum + item.quantidade * item.valorUnitario, 0);
  const lines = validItems.map((item, index) => {
    const subtotal = item.quantidade * item.valorUnitario;
    return [
      `${index + 1}. ${item.descricao}`,
      `Categoria: ${item.categoria || "Não informada"}`,
      `Quantidade: ${item.quantidade}`,
      `Valor unitário: ${formatCurrency(item.valorUnitario)}`,
      `Subtotal: ${formatCurrency(subtotal)}`,
      `Justificativa: ${item.justificativa || "Não informada"}`
    ].join("\n");
  });

  return [
    "# Orçamento detalhado do projeto",
    "",
    ...lines.flatMap((line) => [line, ""]),
    `Total estimado: ${formatCurrency(total)}`,
    "",
    "Observação: revise os valores e a classificação orçamentária conforme as exigências da instituição e do CEP/Conep antes da submissão."
  ].join("\n");
}

export function OrcamentoGenerator() {
  const [items, setItems] = useState<BudgetItem[]>(initialItems);
  const [message, setMessage] = useState<string | null>(null);

  const total = useMemo(
    () => items.reduce((sum, item) => sum + item.quantidade * item.valorUnitario, 0),
    [items]
  );

  const updateItem = (id: number, field: keyof BudgetItem, value: string) => {
    setItems((current) =>
      current.map((item) => {
        if (item.id !== id) {
          return item;
        }

        if (field === "quantidade" || field === "valorUnitario") {
          return {
            ...item,
            [field]: Number(value) || 0
          };
        }

        return {
          ...item,
          [field]: value
        };
      })
    );
  };

  const addItem = () => {
    setItems((current) => [
      ...current,
      {
        id: Date.now(),
        categoria: "",
        descricao: "",
        justificativa: "",
        quantidade: 1,
        valorUnitario: 0
      }
    ]);
  };

  const removeItem = (id: number) => {
    setItems((current) => current.filter((item) => item.id !== id));
  };

  const copyBudget = async () => {
    await navigator.clipboard.writeText(buildBudgetDraft(items));
    setMessage("Orçamento copiado para a área de transferência.");
    setTimeout(() => setMessage(null), 2400);
  };

  return (
    <div style={{ display: "grid", gap: "32px" }}>
      <div className="no-print" style={{ display: "grid", gap: "16px" }}>
        <div style={{ display: "grid", gap: "6px" }}>
          <h2 style={{ margin: 0 }}>Gerar orçamento detalhado</h2>
          <p className="muted" style={{ margin: 0 }}>
            Organize custos previstos, justificativas e itens sem financiamento antes de revisar no
            fluxo oficial da Plataforma Brasil.
          </p>
        </div>

        <div style={{ display: "grid", gap: "14px" }}>
          {items.map((item, index) => (
            <div
              key={item.id}
              style={{
                border: "1px solid rgba(36,26,19,0.1)",
                borderRadius: "18px",
                display: "grid",
                gap: "12px",
                padding: "16px"
              }}
            >
              <strong>Item {index + 1}</strong>
              <div style={{ display: "grid", gap: "12px", gridTemplateColumns: "1.2fr 1fr" }}>
                <div className="field">
                  <label>Descrição</label>
                  <input
                    value={item.descricao}
                    onChange={(event) => updateItem(item.id, "descricao", event.target.value)}
                    placeholder="Ex.: material de consumo, deslocamento, impressão..."
                  />
                </div>
                <div className="field">
                  <label>Categoria</label>
                  <input
                    value={item.categoria}
                    onChange={(event) => updateItem(item.id, "categoria", event.target.value)}
                    placeholder="Ex.: material, serviço, sem financiamento"
                  />
                </div>
                <div className="field">
                  <label>Quantidade</label>
                  <input
                    min="0"
                    type="number"
                    value={item.quantidade}
                    onChange={(event) => updateItem(item.id, "quantidade", event.target.value)}
                  />
                </div>
                <div className="field">
                  <label>Valor unitário</label>
                  <input
                    min="0"
                    step="0.01"
                    type="number"
                    value={item.valorUnitario}
                    onChange={(event) => updateItem(item.id, "valorUnitario", event.target.value)}
                  />
                </div>
                <div className="field" style={{ gridColumn: "1 / -1" }}>
                  <label>Justificativa</label>
                  <textarea
                    rows={2}
                    value={item.justificativa}
                    onChange={(event) => updateItem(item.id, "justificativa", event.target.value)}
                  />
                </div>
              </div>
              <div style={{ alignItems: "center", display: "flex", gap: "12px", justifyContent: "space-between" }}>
                <span className="muted">Subtotal: {formatCurrency(item.quantidade * item.valorUnitario)}</span>
                <button className="button button-secondary" onClick={() => removeItem(item.id)} type="button">
                  Remover
                </button>
              </div>
            </div>
          ))}
        </div>

        <div style={{ alignItems: "center", display: "flex", flexWrap: "wrap", gap: "12px", justifyContent: "space-between" }}>
          <strong>Total estimado: {formatCurrency(total)}</strong>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
            <button className="button button-secondary" onClick={addItem} type="button">
              Adicionar item
            </button>
            <button className="button button-secondary" onClick={() => void copyBudget()} type="button">
              Copiar rascunho
            </button>
            <button className="button button-primary" onClick={() => window.print()} type="button">
              Gerar PDF (imprimir)
            </button>
          </div>
        </div>

        {message ? <p className="muted" style={{ margin: 0 }}>{message}</p> : null}
      </div>

      <div
        className="print-only"
        style={{ color: "#000", fontFamily: "Times New Roman, serif", lineHeight: "1.5" }}
      >
        <h2
          style={{
            fontSize: "16pt",
            marginBottom: "32px",
            textAlign: "center",
            textTransform: "uppercase"
          }}
        >
          ORÇAMENTO DETALHADO DO PROJETO
        </h2>

        <table style={{ borderCollapse: "collapse", marginBottom: "32px", width: "100%" }}>
          <thead>
            <tr>
              {["Item", "Categoria", "Qtd.", "Valor unit.", "Subtotal", "Justificativa"].map((heading) => (
                <th key={heading} style={{ border: "1px solid #000", fontSize: "11pt", padding: "8px" }}>
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td style={{ border: "1px solid #000", fontSize: "11pt", padding: "8px" }}>{item.descricao || "-"}</td>
                <td style={{ border: "1px solid #000", fontSize: "11pt", padding: "8px" }}>{item.categoria || "-"}</td>
                <td style={{ border: "1px solid #000", fontSize: "11pt", padding: "8px", textAlign: "center" }}>{item.quantidade}</td>
                <td style={{ border: "1px solid #000", fontSize: "11pt", padding: "8px" }}>{formatCurrency(item.valorUnitario)}</td>
                <td style={{ border: "1px solid #000", fontSize: "11pt", padding: "8px" }}>{formatCurrency(item.quantidade * item.valorUnitario)}</td>
                <td style={{ border: "1px solid #000", fontSize: "11pt", padding: "8px" }}>{item.justificativa || "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <p style={{ fontSize: "12pt", textAlign: "right" }}>
          <strong>Total estimado: {formatCurrency(total)}</strong>
        </p>
      </div>
    </div>
  );
}
