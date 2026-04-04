export type UserRole = "coordenador" | "coordenador_geral" | "pesquisador";
export type ArticleStatus = "em_rascunho" | "submetido" | "aprovado";

export type ArticleContent = {
  type: "doc";
  content: Array<Record<string, unknown>>;
};

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
    };
  };
};

export type ArticleRow = Database["public"]["Tables"]["artigos"]["Row"];
