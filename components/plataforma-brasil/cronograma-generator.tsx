"use client";

import { useState } from "react";

export function CronogramaGenerator() {
  const [etapas, setEtapas] = useState([
    { id: 1, descricao: "Revisao bibliografica", inicio: "", fim: "" },
    { id: 2, descricao: "Submissao ao CEP", inicio: "", fim: "" },
    { id: 3, descricao: "Coleta de dados", inicio: "", fim: "" },
    { id: 4, descricao: "Analise de dados", inicio: "", fim: "" },
    { id: 5, descricao: "Redacao do artigo", inicio: "", fim: "" }
  ]);

  const addEtapa = () => {
    setEtapas([...etapas, { id: Date.now(), descricao: "", inicio: "", fim: "" }]);
  };

  const updateEtapa = (id: number, field: string, value: string) => {
    setEtapas(etapas.map((etapa) => (etapa.id === id ? { ...etapa, [field]: value } : etapa)));
  };

  const removeEtapa = (id: number) => {
    setEtapas(etapas.filter((etapa) => etapa.id !== id));
  };

  return (
    <div style={{ display: "grid", gap: "32px" }}>
      <div className="no-print" style={{ display: "grid", gap: "16px" }}>
        <h2 style={{ margin: 0 }}>Gerar cronograma de execucao</h2>
        <p className="muted" style={{ margin: 0 }}>
          Preencha as fases da pesquisa. O formato tabular ajuda a organizar a submissao na
          Plataforma Brasil.
        </p>
      </div>

      <div className="no-print" style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {etapas.map((etapa, index) => (
          <div
            key={etapa.id}
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 150px 150px auto",
              gap: "12px",
              alignItems: "end"
            }}
          >
            <div className="field">
              <label>Fase {index + 1}</label>
              <input
                value={etapa.descricao}
                onChange={(event) => updateEtapa(etapa.id, "descricao", event.target.value)}
                placeholder="Descricao da atividade"
              />
            </div>
            <div className="field">
              <label>Mes/ano de inicio</label>
              <input
                type="month"
                value={etapa.inicio}
                onChange={(event) => updateEtapa(etapa.id, "inicio", event.target.value)}
              />
            </div>
            <div className="field">
              <label>Mes/ano de termino</label>
              <input
                type="month"
                value={etapa.fim}
                onChange={(event) => updateEtapa(etapa.id, "fim", event.target.value)}
              />
            </div>
            <button
              className="button button-secondary"
              onClick={() => removeEtapa(etapa.id)}
              type="button"
              style={{ height: "42px" }}
            >
              Remover
            </button>
          </div>
        ))}

        <div style={{ display: "flex", gap: "12px", marginTop: "16px" }}>
          <button className="button button-secondary no-print" onClick={addEtapa} type="button">
            Adicionar fase
          </button>
          <button className="button button-primary no-print" onClick={() => window.print()} type="button">
            Gerar PDF (imprimir)
          </button>
        </div>
      </div>

      <div
        className="print-only"
        style={{ color: "#000", fontFamily: "Times New Roman, serif", lineHeight: "1.5" }}
      >
        <h2
          style={{
            textAlign: "center",
            textTransform: "uppercase",
            marginBottom: "32px",
            fontSize: "16pt"
          }}
        >
          CRONOGRAMA DE EXECUCAO DO PROJETO
        </h2>

        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "32px" }}>
          <thead>
            <tr>
              <th
                style={{ border: "1px solid #000", padding: "8px", textAlign: "left", fontSize: "12pt" }}
              >
                Fase / etapa da pesquisa
              </th>
              <th
                style={{ border: "1px solid #000", padding: "8px", textAlign: "center", fontSize: "12pt" }}
              >
                Inicio (mes/ano)
              </th>
              <th
                style={{ border: "1px solid #000", padding: "8px", textAlign: "center", fontSize: "12pt" }}
              >
                Termino (mes/ano)
              </th>
            </tr>
          </thead>
          <tbody>
            {etapas.map((etapa) => (
              <tr key={etapa.id}>
                <td style={{ border: "1px solid #000", padding: "8px", fontSize: "12pt" }}>
                  {etapa.descricao || "-"}
                </td>
                <td
                  style={{ border: "1px solid #000", padding: "8px", textAlign: "center", fontSize: "12pt" }}
                >
                  {etapa.inicio
                    ? new Date(etapa.inicio).toLocaleDateString("pt-BR", {
                        month: "2-digit",
                        year: "numeric"
                      })
                    : "-"}
                </td>
                <td
                  style={{ border: "1px solid #000", padding: "8px", textAlign: "center", fontSize: "12pt" }}
                >
                  {etapa.fim
                    ? new Date(etapa.fim).toLocaleDateString("pt-BR", {
                        month: "2-digit",
                        year: "numeric"
                      })
                    : "-"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <p style={{ fontSize: "12pt", textAlign: "justify" }}>
          O cronograma acima descreve as atividades a serem desenvolvidas em cada periodo do estudo,
          garantindo que o tempo previsto seja adequado para o cumprimento dos objetivos propostos.
        </p>
      </div>
    </div>
  );
}
