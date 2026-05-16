export interface ThemeResult {
  theme_name: string;
  category: string;
  summary: string;
  directions: Direction[];
}

export interface Direction {
  name: string;
  position: string;
  description: string;
}

export interface ChainResult {
  direction: string;
  upstream: string[];
  midstream: string[];
  downstream: string[];
  key_materials: string[];
  key_equipment: string[];
}

export interface CompanyMapping {
  company_name: string;
  ticker: string;
  market: "A" | "US";
  reasoning: string;
  relevance: string;
}

export interface ScoredCompany {
  company_name: string;
  ticker: string;
  market: "A" | "US";
  exposure_score: number;
  dimensions: {
    product_relevance: number;
    revenue_elasticity: number;
    chain_criticality: number;
    competitive_moat: number;
    market_awareness: number;
  };
  investment_logic: string;
  key_variables: string[];
  risks: string[];
}

export interface AnalysisState {
  task_id: string;
  topic: string;
  market: string;
  status: string;
  current_step: string;
  theme: ThemeResult | null;
  chain: ChainResult[];
  companies: CompanyMapping[];
  scored: ScoredCompany[];
  error: string | null;
}

export interface GraphData {
  nodes: { id: string; type: string; data: Record<string, unknown> }[];
  edges: { source: string; target: string; type: string; data?: Record<string, unknown> }[];
}
