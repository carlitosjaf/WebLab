export const publicNavLinks = [
  { label: "Home", href: "/dashboard" },
  { label: "Equipe", href: "/dashboard/equipe" },
  { label: "Artigos", href: "/dashboard/artigos" },
  { label: "Triagem", href: "/dashboard/triagem" },
  { label: "Publicações", href: "/dashboard/publicacoes" },
  { label: "Avisos", href: "/dashboard/avisos" }
] as const;

export const labStats = [
  { icon: "01", value: "12", label: "Pesquisadores ativos" },
  { icon: "02", value: "47", label: "Publicações" },
  { icon: "03", value: "5", label: "Artigos em projeto" },
  { icon: "04", value: "$2.3M", label: "Financiamento ativo" }
];

export const weblabTools = [
  {
    icon: "L",
    label: "Assistente Lattes",
    description: "Organize informações do manuscrito para apoiar registros e produção curricular.",
    href: "/dashboard/assistente-lattes"
  },
  {
    icon: "P",
    label: "Radar de periódicos",
    description: "Encontre revistas para submissão, indexadores e shortlist editorial.",
    href: "/dashboard/periodicos"
  },
  {
    icon: "B",
    label: "Plataforma Brasil",
    description: "Acompanhe checklist, documentos e etapas de submissão ética.",
    href: "/dashboard/plataforma-brasil"
  },
  {
    icon: "T",
    label: "Triagem de evidências",
    description: "Capture estudos, registre decisões e monte o primeiro caderno PRISMA da revisão.",
    href: "/dashboard/triagem"
  },
  {
    icon: "E",
    label: "Editor vivo",
    description: "Escreva, revise, salve e exporte manuscritos científicos em equipe.",
    href: "/dashboard"
  }
];

export const activeProjects = [
  {
    title: "Escrita colaborativa em pós-graduação e desigualdades estruturais",
    status: "Ativo",
    duration: "Em escrita",
    funding: "WebLab",
    team: ["Carlos Junior", "Equipe LITEB"],
    description:
      "Manuscrito em construção sobre experiências de mulheres na pós-graduação brasileira, com dados quantitativos e relatos nacionais.",
    image: "https://images.pexels.com/photos/3825527/pexels-photo-3825527.jpeg?auto=compress&cs=tinysrgb&w=900"
  },
  {
    title: "Modelos de submissão e radar editorial",
    status: "Ativo",
    duration: "Em organização",
    funding: "WebLab",
    team: ["Equipe WebLab"],
    description:
      "Fluxo para localizar periódicos, validar indexadores e organizar uma shortlist editorial antes da submissão.",
    image: "https://images.pexels.com/photos/2280571/pexels-photo-2280571.jpeg?auto=compress&cs=tinysrgb&w=900"
  },
  {
    title: "Plataforma Brasil e documentos de apoio",
    status: "Ativo",
    duration: "Em processo",
    funding: "WebLab",
    team: ["Equipe WebLab"],
    description:
      "Checklist e documentos auxiliares para apoiar submissões éticas e organização burocrática de projetos.",
    image: "https://images.pexels.com/photos/3938022/pexels-photo-3938022.jpeg?auto=compress&cs=tinysrgb&w=900"
  }
];

export const featuredResearch = activeProjects.slice(0, 3);

export const publications = [
  {
    year: "2026",
    title: "Para além da pandemia: desigualdades estruturais na experiência de mulheres na pós-graduação brasileira",
    authors: "Equipe WebLab",
    journal: "Em preparação",
    status: "Manuscrito em finalização",
    citations: "0",
    featured: true,
    abstract:
      "Estudo em construção sobre desigualdades estruturais, saúde mental, sobrecarga de cuidado e condições de produção científica na pós-graduação brasileira."
  },
  {
    year: "2025",
    title: "Radar editorial e indexadores para submissão científica",
    authors: "Equipe WebLab",
    journal: "Em planejamento",
    status: "Projeto ativo",
    citations: "0",
    featured: true,
    abstract:
      "Módulo dedicado a apoiar a escolha de periódicos para submissão a partir de aderência temática, indexadores e estágio editorial."
  },
  {
    year: "2025",
    title: "Documentos de apoio para submissão ética em pesquisa",
    authors: "Equipe WebLab",
    journal: "Em planejamento",
    status: "Projeto ativo",
    citations: "0",
    featured: false,
    abstract:
      "Organização de checklist, TCLE, cronograma e orçamento para reduzir atrito em submissões à Plataforma Brasil."
  }
];

export const newsItems = [
  {
    date: "Abril 2026",
    category: "Avisos",
    title: "WebLab em implantação",
    text: "O laboratório virtual está em fase de consolidação de escrita, equipe, radar editorial e submissão.",
    fullText:
      "O WebLab está em implantação como ambiente de apoio à produção científica, organização de manuscritos, escolha de periódicos e preparação documental."
  },
  {
    date: "Abril 2026",
    category: "Publicações",
    title: "Radar editorial em testes",
    text: "A área de periódicos passa a priorizar revistas para submissão, indexadores e shortlist editorial.",
    fullText:
      "A ferramenta de periódicos foi reorganizada para funcionar como radar editorial, com foco principal em encontrar revistas adequadas à submissão do manuscrito."
  }
];

export const principalInvestigator = {
  name: "Dr. Paulo Roberto Stephens",
  role: "Pesquisador, Instituto Oswaldo Cruz (Fiocruz)",
  education: "Doutor em Neurociências (UFF), Mestre em Microbiologia e Imunologia (UFRJ)",
  research: ["virologia", "microbiologia", "bioprospecção", "antivirais"],
  bio:
    "Atua no Laboratório de Inovações em Terapias, Ensino e Bioprodutos (LITEB/IOC/Fiocruz), com foco em microbiologia e virologia.",
  email: "paulo.stephens@fiocruz.br",
  image: "/team-pi.jpg"
};

export const teamMembers = [
  {
    name: "Dra. Roberta Pires Corrêa",
    role: "Pesquisadora, Instituto Oswaldo Cruz (Fiocruz)",
    category: "Pós-doutorandos",
    image: "https://images.pexels.com/photos/5905709/pexels-photo-5905709.jpeg?auto=compress&cs=tinysrgb&w=600"
  },
  {
    name: "Carlos Junior",
    role: "Estudante de graduação",
    category: "Estudantes de graduação",
    image: "https://images.pexels.com/photos/5905555/pexels-photo-5905555.jpeg?auto=compress&cs=tinysrgb&w=600"
  }
];
