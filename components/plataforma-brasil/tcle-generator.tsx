"use client";

import { useState } from "react";

export function TcleGenerator() {
  const [data, setData] = useState({
    titulo: "",
    pesquisadorResponsavel: "",
    telefone: "",
    email: "",
    objetivo: "",
    procedimentos: "",
    riscos:
      "A participacao nesta pesquisa envolve riscos minimos, como desconforto ao preencher questionarios ou falar sobre temas abordados no estudo. Para minimizar estes riscos, voce podera interromper a participacao a qualquer momento.",
    beneficios:
      "Embora nao existam beneficios diretos aos participantes, espera-se que este estudo contribua para o conhecimento cientifico na area, ajudando o avanco das estrategias em saude publica."
  });

  const handleChange = (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setData({ ...data, [event.target.name]: event.target.value });
  };

  return (
    <div style={{ display: "grid", gap: "32px" }}>
      <div className="no-print" style={{ display: "grid", gap: "16px" }}>
        <h2 style={{ margin: 0 }}>Gerar TCLE</h2>
        <p className="muted" style={{ margin: 0 }}>
          Preencha os campos abaixo. O texto ja vem estruturado com sigilo, voluntariedade e
          recusa, facilitando a revisao antes da submissao.
        </p>

        <div style={{ display: "grid", gap: "16px", gridTemplateColumns: "1fr 1fr" }}>
          <div className="field" style={{ gridColumn: "1 / -1" }}>
            <label>Titulo da pesquisa</label>
            <input
              name="titulo"
              value={data.titulo}
              onChange={handleChange}
              placeholder="Titulo completo igual ao cadastro da Plataforma Brasil"
            />
          </div>
          <div className="field">
            <label>Pesquisador(a) responsavel</label>
            <input
              name="pesquisadorResponsavel"
              value={data.pesquisadorResponsavel}
              onChange={handleChange}
            />
          </div>
          <div className="field">
            <label>Telefone e e-mail institucional</label>
            <input
              name="telefone"
              value={data.telefone}
              onChange={handleChange}
              placeholder="(XX) XXXXX-XXXX / email@fiocruz.br"
            />
          </div>
          <div className="field" style={{ gridColumn: "1 / -1" }}>
            <label>Objetivo da pesquisa em linguagem clara</label>
            <textarea name="objetivo" value={data.objetivo} onChange={handleChange} rows={2} />
          </div>
          <div className="field" style={{ gridColumn: "1 / -1" }}>
            <label>Como sera a participacao</label>
            <textarea
              name="procedimentos"
              value={data.procedimentos}
              onChange={handleChange}
              rows={3}
            />
          </div>
          <div className="field" style={{ gridColumn: "1 / -1" }}>
            <label>Riscos aos quais o participante estara exposto</label>
            <textarea name="riscos" value={data.riscos} onChange={handleChange} rows={2} />
          </div>
          <div className="field" style={{ gridColumn: "1 / -1" }}>
            <label>Beneficios esperados</label>
            <textarea name="beneficios" value={data.beneficios} onChange={handleChange} rows={2} />
          </div>
        </div>

        <button
          className="button button-primary no-print"
          onClick={() => window.print()}
          type="button"
          style={{ width: "fit-content" }}
        >
          Gerar PDF (imprimir)
        </button>
      </div>

      <div
        className="print-only"
        style={{ color: "#000", fontFamily: "Times New Roman, serif", lineHeight: "1.5" }}
      >
        <h2
          style={{
            textAlign: "center",
            textTransform: "uppercase",
            marginBottom: "24px",
            fontSize: "14pt"
          }}
        >
          TERMO DE CONSENTIMENTO LIVRE E ESCLARECIDO (TCLE)
        </h2>

        <div style={{ fontSize: "12pt", textAlign: "justify", display: "grid", gap: "16px" }}>
          <p>
            Convidamos voce a participar da pesquisa intitulada{" "}
            <strong>"{data.titulo || "[TITULO DA PESQUISA]"}"</strong>, sob responsabilidade do(a)
            pesquisador(a){" "}
            <strong>{data.pesquisadorResponsavel || "[NOME DO PESQUISADOR]"}</strong>. Este
            documento contem as informacoes necessarias para que voce decida se quer ou nao
            participar do estudo.
          </p>

          <p>
            <strong>1. OBJETIVO DO ESTUDO</strong>
            <br />
            {data.objetivo || "[OBJETIVO DA PESQUISA AQUI]"}
          </p>

          <p>
            <strong>2. A SUA PARTICIPACAO</strong>
            <br />A sua participacao consistira em{" "}
            {data.procedimentos || "[DESCRICAO DOS PROCEDIMENTOS]"}. A sua colaboracao e totalmente
            voluntaria.
          </p>

          <p>
            <strong>3. RISCOS E DESCONFORTOS</strong>
            <br />
            {data.riscos}
          </p>

          <p>
            <strong>4. BENEFICIOS</strong>
            <br />
            {data.beneficios}
          </p>

          <p>
            <strong>5. GARANTIA DE SIGILO E PRIVACIDADE</strong>
            <br />
            Garantimos o completo sigilo sobre sua identidade. Nenhuma informacao que possa
            identifica-lo(a) sera publicada. Os dados coletados serao utilizados exclusivamente para
            fins cientificos e tratados em conformidade com as exigencias do Conselho Nacional de
            Saude (CNS).
          </p>

          <p>
            <strong>6. DIREITO DE RECUSA OU DESISTENCIA</strong>
            <br />
            Voce e livre para recusar-se a participar ou para retirar seu consentimento em qualquer
            fase do estudo, sem qualquer tipo de penalizacao ou prejuizo ao seu cuidado ou
            acompanhamento de rotina.
          </p>

          <p>
            <strong>7. RESSARCIMENTO E INDENIZACAO</strong>
            <br />A participacao nao acarreta custos financeiros a voce, e tampouco havera
            remuneracao pela sua participacao. Conforme resolucao do CNS, e garantido o direito de
            ressarcimento por eventuais gastos gerados direta e exclusivamente pela pesquisa e o
            direito a indenizacao por eventuais danos comprovadamente decorrentes deste estudo.
          </p>

          <p>
            <strong>8. CONTATOS E DUVIDAS</strong>
            <br />
            Em caso de duvidas, voce pode entrar em contato com o pesquisador responsavel pelo
            telefone/e-mail: {data.telefone || "[CONTATO DO PESQUISADOR]"}. Se houver duvidas sobre
            os aspectos eticos deste estudo, voce pode consultar o Comite de Etica em Pesquisa
            (CEP) da instituicao.
          </p>

          <br />
          <p style={{ textAlign: "center" }}>
            <strong>DECLARACAO DE CONSENTIMENTO</strong>
          </p>
          <p>
            Declaro que li e entendi as informacoes deste documento e que todas as minhas duvidas
            foram esclarecidas pelo(a) pesquisador(a). Assino este formulario em duas vias de igual
            teor, ficando uma via comigo e a outra com o pesquisador.
          </p>

          <div style={{ display: "flex", justifyContent: "space-between", marginTop: "60px" }}>
            <div
              style={{
                width: "45%",
                borderTop: "1px solid #000",
                textAlign: "center",
                paddingTop: "8px"
              }}
            >
              Assinatura do(a) participante
            </div>
            <div
              style={{
                width: "45%",
                borderTop: "1px solid #000",
                textAlign: "center",
                paddingTop: "8px"
              }}
            >
              Assinatura do(a) pesquisador(a)
            </div>
          </div>
          <div style={{ marginTop: "16px" }}>
            Local e data: _________________________________, _____/_____/_______
          </div>
        </div>
      </div>
    </div>
  );
}
