export type UserRole = "coordenador" | "coordenador_geral" | "pesquisador";
export type ArticleStatus = "em_rascunho" | "submetido" | "aprovado";
export type RecommendationLevel =
  | "candidata_forte"
  | "candidata_moderada"
  | "precisa_validar";
export type EvidenceScreeningDecision = "pendente" | "incluir" | "excluir" | "talvez";

export type ArticleContent = {
  type: "doc";
  content: Array<Record<string, unknown>>;
};

export type TeamSiteMember = {
  nome: string;
  funcao: string;
  categoria: string;
  email?: string | null;
  imagem?: string | null;
};

export type TeamNoticeCategory = "Aviso" | "Evento" | "Publicação" | "Prazo";

export type Database = {
  public: {
    Views: Record<string, never>;
    Functions: {
      claim_team_invite: {
        Args: {
          invite_code_input: string;
        };
        Returns: string;
      };
      current_profile_role: {
        Args: Record<PropertyKey, never>;
        Returns: string | null;
      };
      current_profile_team_id: {
        Args: Record<PropertyKey, never>;
        Returns: string | null;
      };
      can_access_team: {
        Args: {
          target_team_id: string;
        };
        Returns: boolean;
      };
      can_admin_team: {
        Args: {
          target_team_id: string;
        };
        Returns: boolean;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
    Tables: {
      equipes: {
        Row: {
          id: string;
          nome: string;
          codigo_convite: string | null;
        };
        Insert: {
          id?: string;
          nome: string;
          codigo_convite?: string | null;
        };
        Update: {
          nome?: string;
          codigo_convite?: string | null;
        };
        Relationships: [];
      };
      perfis: {
        Row: {
          id: string;
          nome_completo: string | null;
          equipe_id: string | null;
          role: UserRole;
        };
        Insert: {
          id: string;
          nome_completo?: string | null;
          equipe_id?: string | null;
          role?: UserRole;
        };
        Update: {
          nome_completo?: string | null;
          equipe_id?: string | null;
          role?: UserRole;
        };
        Relationships: [
          {
            foreignKeyName: "perfis_equipe_id_fkey";
            columns: ["equipe_id"];
            isOneToOne: false;
            referencedRelation: "equipes";
            referencedColumns: ["id"];
          }
        ];
      };
      artigos: {
        Row: {
          id: string;
          titulo: string;
          conteudo_json: ArticleContent | null;
          status: ArticleStatus;
          autor_id: string;
          equipe_id: string;
          updated_at: string | null;
          last_editor_id: string | null;
        };
        Insert: {
          id?: string;
          titulo: string;
          conteudo_json?: ArticleContent | null;
          status?: ArticleStatus;
          autor_id?: string;
          equipe_id?: string;
          updated_at?: string | null;
          last_editor_id?: string | null;
        };
        Update: {
          titulo?: string;
          conteudo_json?: ArticleContent | null;
          status?: ArticleStatus;
          updated_at?: string | null;
          last_editor_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "artigos_autor_id_fkey";
            columns: ["autor_id"];
            isOneToOne: false;
            referencedRelation: "perfis";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "artigos_equipe_id_fkey";
            columns: ["equipe_id"];
            isOneToOne: false;
            referencedRelation: "equipes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "artigos_last_editor_id_fkey";
            columns: ["last_editor_id"];
            isOneToOne: false;
            referencedRelation: "perfis";
            referencedColumns: ["id"];
          }
        ];
      };
      plataforma_brasil_checklists: {
        Row: {
          id: string;
          equipe_id: string;
          tcle_gerado: boolean;
          cronograma_pronto: boolean;
          orcamento_detalhado: boolean;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          equipe_id: string;
          tcle_gerado?: boolean;
          cronograma_pronto?: boolean;
          orcamento_detalhado?: boolean;
          updated_at?: string | null;
        };
        Update: {
          tcle_gerado?: boolean;
          cronograma_pronto?: boolean;
          orcamento_detalhado?: boolean;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "plataforma_brasil_checklists_equipe_id_fkey";
            columns: ["equipe_id"];
            isOneToOne: true;
            referencedRelation: "equipes";
            referencedColumns: ["id"];
          }
        ];
      };
      periodicos_shortlists: {
        Row: {
          id: string;
          artigo_id: string;
          journal_id: string;
          journal_title: string;
          host_name: string | null;
          source_url: string | null;
          recommendation_level: RecommendationLevel;
          matched_indexers: string[];
          detected_indexers: string[];
          editorial_score: number;
          is_favorite: boolean;
          editorial_notes: string;
          escopo_conferido: boolean;
          indexadores_confirmados: boolean;
          taxas_conferidas: boolean;
          diretrizes_conferidas: boolean;
          acesso_aberto_conferido: boolean;
          template_conferido: boolean;
          created_by: string;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          artigo_id: string;
          journal_id: string;
          journal_title: string;
          host_name?: string | null;
          source_url?: string | null;
          recommendation_level?: RecommendationLevel;
          matched_indexers?: string[];
          detected_indexers?: string[];
          editorial_score?: number;
          is_favorite?: boolean;
          editorial_notes?: string;
          escopo_conferido?: boolean;
          indexadores_confirmados?: boolean;
          taxas_conferidas?: boolean;
          diretrizes_conferidas?: boolean;
          acesso_aberto_conferido?: boolean;
          template_conferido?: boolean;
          created_by?: string;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          journal_title?: string;
          host_name?: string | null;
          source_url?: string | null;
          recommendation_level?: RecommendationLevel;
          matched_indexers?: string[];
          detected_indexers?: string[];
          editorial_score?: number;
          is_favorite?: boolean;
          editorial_notes?: string;
          escopo_conferido?: boolean;
          indexadores_confirmados?: boolean;
          taxas_conferidas?: boolean;
          diretrizes_conferidas?: boolean;
          acesso_aberto_conferido?: boolean;
          template_conferido?: boolean;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "periodicos_shortlists_artigo_id_fkey";
            columns: ["artigo_id"];
            isOneToOne: false;
            referencedRelation: "artigos";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "periodicos_shortlists_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "perfis";
            referencedColumns: ["id"];
          }
        ];
      };
      conteudos_site_equipe: {
        Row: {
          id: string;
          equipe_id: string;
          titulo_publico: string | null;
          resumo_publico: string | null;
          integrantes: TeamSiteMember[];
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          equipe_id: string;
          titulo_publico?: string | null;
          resumo_publico?: string | null;
          integrantes?: TeamSiteMember[];
          updated_at?: string | null;
        };
        Update: {
          titulo_publico?: string | null;
          resumo_publico?: string | null;
          integrantes?: TeamSiteMember[];
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "conteudos_site_equipe_equipe_id_fkey";
            columns: ["equipe_id"];
            isOneToOne: true;
            referencedRelation: "equipes";
            referencedColumns: ["id"];
          }
        ];
      };
      avisos_equipe: {
        Row: {
          id: string;
          equipe_id: string;
          titulo: string;
          texto: string;
          categoria: TeamNoticeCategory;
          data_evento: string | null;
          link_url: string | null;
          created_by: string;
          publicado_em: string | null;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          equipe_id: string;
          titulo: string;
          texto: string;
          categoria?: TeamNoticeCategory;
          data_evento?: string | null;
          link_url?: string | null;
          created_by?: string;
          publicado_em?: string | null;
          updated_at?: string | null;
        };
        Update: {
          titulo?: string;
          texto?: string;
          categoria?: TeamNoticeCategory;
          data_evento?: string | null;
          link_url?: string | null;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "avisos_equipe_equipe_id_fkey";
            columns: ["equipe_id"];
            isOneToOne: false;
            referencedRelation: "equipes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "avisos_equipe_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "perfis";
            referencedColumns: ["id"];
          }
        ];
      };
      triagem_conjuntos: {
        Row: {
          id: string;
          artigo_id: string;
          equipe_id: string;
          titulo: string;
          pergunta: string;
          criterios_inclusao: string;
          criterios_exclusao: string;
          created_by: string;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          artigo_id: string;
          equipe_id: string;
          titulo: string;
          pergunta?: string;
          criterios_inclusao?: string;
          criterios_exclusao?: string;
          created_by?: string;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          titulo?: string;
          pergunta?: string;
          criterios_inclusao?: string;
          criterios_exclusao?: string;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "triagem_conjuntos_artigo_id_fkey";
            columns: ["artigo_id"];
            isOneToOne: false;
            referencedRelation: "artigos";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "triagem_conjuntos_equipe_id_fkey";
            columns: ["equipe_id"];
            isOneToOne: false;
            referencedRelation: "equipes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "triagem_conjuntos_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "perfis";
            referencedColumns: ["id"];
          }
        ];
      };
      triagem_estudos: {
        Row: {
          id: string;
          conjunto_id: string;
          external_id: string;
          source: string;
          titulo: string;
          autores: string[];
          ano: number | null;
          doi: string | null;
          periodico: string | null;
          resumo: string | null;
          url: string | null;
          decisao: EvidenceScreeningDecision;
          motivo_exclusao: string;
          notas: string;
          added_by: string;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          conjunto_id: string;
          external_id: string;
          source?: string;
          titulo: string;
          autores?: string[];
          ano?: number | null;
          doi?: string | null;
          periodico?: string | null;
          resumo?: string | null;
          url?: string | null;
          decisao?: EvidenceScreeningDecision;
          motivo_exclusao?: string;
          notas?: string;
          added_by?: string;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          decisao?: EvidenceScreeningDecision;
          motivo_exclusao?: string;
          notas?: string;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "triagem_estudos_conjunto_id_fkey";
            columns: ["conjunto_id"];
            isOneToOne: false;
            referencedRelation: "triagem_conjuntos";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "triagem_estudos_added_by_fkey";
            columns: ["added_by"];
            isOneToOne: false;
            referencedRelation: "perfis";
            referencedColumns: ["id"];
          }
        ];
      };
      triagem_avaliacoes: {
        Row: {
          id: string;
          estudo_id: string;
          reviewer_id: string;
          decisao: EvidenceScreeningDecision;
          motivo_exclusao: string;
          notas: string;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          estudo_id: string;
          reviewer_id?: string;
          decisao?: EvidenceScreeningDecision;
          motivo_exclusao?: string;
          notas?: string;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          decisao?: EvidenceScreeningDecision;
          motivo_exclusao?: string;
          notas?: string;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "triagem_avaliacoes_estudo_id_fkey";
            columns: ["estudo_id"];
            isOneToOne: false;
            referencedRelation: "triagem_estudos";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "triagem_avaliacoes_reviewer_id_fkey";
            columns: ["reviewer_id"];
            isOneToOne: false;
            referencedRelation: "perfis";
            referencedColumns: ["id"];
          }
        ];
      };
    };
  };
};

export type ArticleRow = Database["public"]["Tables"]["artigos"]["Row"];
export type TeamNoticeRow = Database["public"]["Tables"]["avisos_equipe"]["Row"];
export type EvidenceScreeningSetRow = Database["public"]["Tables"]["triagem_conjuntos"]["Row"];
export type EvidenceStudyRow = Database["public"]["Tables"]["triagem_estudos"]["Row"];
export type EvidenceStudyReviewRow = Database["public"]["Tables"]["triagem_avaliacoes"]["Row"];
