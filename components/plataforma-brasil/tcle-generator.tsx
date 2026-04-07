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
      "A participação nesta pesquisa envolve riscos mínimos, como desconforto ao preencher questionários ou falar sobre temas abordados no estudo. Para minimizar estes riscos, você poderá interromper a participação a qualquer momento.",
    beneficios:
      "Embora não existam benefícios diretos aos participantes, espera-se que este estudo contribua para o conhecimento científico na área, ajudando o avanço das estratégias em saúde pública."
  });

  const handleChange = (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setData({ ...data, [event.target.name]: event.target.value });
  };

  return (
    <div style={{ display: "grid", gap: "32px" }}>
      <div className="no-print" style={{ display: "grid", gap: "16px" }}>
        <h2 style={{ margin: 0 }}>Gerar TCLE</h2>
        <p className="muted" style={{ margin: 0 }}>
          Preencha os campos abaixo. O texto já vem estruturado com sigilo, voluntariedade e
          recusa, facilitando a revisão antes da submissão.
        </p>

        <div style={{ display: "grid", gap: "16px", gridTemplateColumns: "1fr 1fr" }}>
          <div className="field" style={{ gridColumn: "1 / -1" }}>
            <label>Título da pesquisa</label>
            <input
              name="titulo"
              value={data.titulo}
              onChange={handleChange}
              placeholder="Título completo igual ao cadastro da Plataforma Brasil"
            />
          </div>
          <div className="field">
            <label>Pesquisador(a) responsável</label>
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
            <label>Como será a participação</label>
            <textarea
              name="procedimentos"
              value={data.procedimentos}
              onChange={handleChange}
              rows={3}
            />
          </div>
          <div className="field" style={{ gridColumn: "1 / -1" }}>
            <label>Riscos aos quais o participante estará exposto</label>
            <textarea name="riscos" value={data.riscos} onChange={handleChange} rows={2} />
          </div>
          <div className="field" style={{ gridColumn: "1 / -1" }}>
            <label>Benefícios esperados</label>
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
            Convidamos você a participar da pesquisa intitulada{" "}
            <strong>"{data.titulo || "[TÍTULO DA PESQUISA]"}"</strong>, sob responsabilidade do(a)
            pesquisador(a){" "}
            <strong>{data.pesquisadorResponsavel || "[NOME DO PESQUISADOR]"}</strong>. Este
            documento contém as informações necessárias para que você decida se quer ou não
            participar do estudo.
          </p>

          <p>
            <strong>1. OBJETIVO DO ESTUDO</strong>
            <br />
            {data.objetivo || "[OBJETIVO DA PESQUISA AQUI]"}
          </p>

          <p>
            <strong>2. A SUA PARTICIPAÇÃO</strong>
            <br />A sua participação consistirá em{" "}
            {data.procedimentos || "[DESCRIÇÃO DOS PROCEDIMENTOS]"}. A sua colaboração é totalmente
            voluntaria.
          </p>

          <p>
            <strong>3. RISCOS E DESCONFORTOS</strong>
            <br />
            {data.riscos}
          </p>

          <p>
            <strong>4. BENEFÍCIOS</strong>
            <br />
            {data.beneficios}
          </p>

          <p>
            <strong>5. GARANTIA DE SIGILO E PRIVACIDADE</strong>
            <br />
            Garantimos o completo sigilo sobre sua identidade. Nenhuma informação que possa
            identificá-lo(a) será publicada. Os dados coletados serão utilizados exclusivamente para
            fins científicos e tratados em conformidade com as exigências do Conselho Nacional de
            Saúde (CNS).
          </p>

          <p>
            <strong>6. DIREITO DE RECUSA OU DESISTENCIA</strong>
            <br />
            Você é livre para recusar-se a participar ou para retirar seu consentimento em qualquer
            fase do estudo, sem qualquer tipo de penalização ou prejuízo ao seu cuidado ou
            acompanhamento de rotina.
          </p>

          <p>
            <strong>7. RESSARCIMENTO E INDENIZAÇÃO</strong>
            <br />A participação não acarreta custos financeiros a você, e tampouco haverá
            remuneração pela sua participação. Conforme resolução do CNS, é garantido o direito de
            ressarcimento por eventuais gastos gerados direta e exclusivamente pela pesquisa e o
            direito a indenização por eventuais danos comprovadamente decorrentes deste estudo.
          </p>

          <p>
            <strong>8. CONTATOS E DÚVIDAS</strong>
            <br />
            Em caso de dúvidas, você pode entrar em contato com o pesquisador responsável pelo
            telefone/e-mail: {data.telefone || "[CONTATO DO PESQUISADOR]"}. Se houver dúvidas sobre
            os aspectos éticos deste estudo, você pode consultar o Comitê de Ética em Pesquisa
            (CEP) da instituição.
          </p>

          <br />
          <p style={{ textAlign: "center" }}>
            <strong>DECLARAÇÃO DE CONSENTIMENTO</strong>
          </p>
          <p>
            Declaro que li e entendi as informações deste documento e que todas as minhas dúvidas
            foram esclarecidas pelo(a) pesquisador(a). Assino este formulário em duas vias de igual
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
