export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
}

export interface LLMProvider {
  id: string;
  name: string;
  chat(
    messages: ChatMessage[],
    options?: ChatOptions,
  ): Promise<string>;
  chatStream?(
    messages: ChatMessage[],
    options?: ChatOptions,
  ): AsyncIterable<string>;
}

export interface MatchAnalysisResult {
  matchId: string;
  summary: string;
  keyInsights: string[];
  narrative: string;
}

export type MatchPredictionResult =
  | {
      matchId: string;
      canonical: true;
      predictedHomeScore: number;
      predictedAwayScore: number;
      homeWinProbability: number;
      drawProbability: number;
      awayWinProbability: number;
      explanation: string;
      expectedGoals?: { home: number; away: number };
      modelVersion?: string;
    }
  | {
      matchId: string;
      canonical: false;
      reason: "not_available" | "invalid_prediction";
      explanation?: string;
    };

export interface PlayerInsightResult {
  playerId: string;
  strengths: string[];
  weaknesses: string[];
  performanceSummary: string;
  outlook: string;
}
