export type UserRole = "coordenador" | "coordenador_geral" | "pesquisador";
export type ArticleStatus = "em_rascunho" | "submetido" | "aprovado";
export type RecommendationLevel =
  | "candidata_forte"
  | "candidata_moderada"
  | "precisa_validar";

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
    };
  };
};

export type ArticleRow = Database["public"]["Tables"]["artigos"]["Row"];
export type TeamNoticeRow = Database["public"]["Tables"]["avisos_equipe"]["Row"];
