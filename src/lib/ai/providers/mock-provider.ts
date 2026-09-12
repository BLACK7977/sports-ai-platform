import type {
  LLMProvider,
  ChatMessage,
  ChatOptions,
} from "@/types/ai";

export class MockLlmProvider implements LLMProvider {
  readonly id = "mock";
  readonly name = "Mock LLM Provider (offline fixtures)";

  private pick(msgs: ChatMessage[]): string {
    const joined = msgs
      .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
      .join("\n\n")
      .toLowerCase();

    if (joined.includes("análisis del partido") || joined.includes("match analysis")) {
      return JSON.stringify({
        summary:
          "Partido disputado y tácticamente equilibrado en el mediocampo. El equipo local aprovechó un contraataque a los 72' para sentenciar el encuentro tras un error defensivo del visitante.",
        keyInsights: [
          "El 60% de la posesión favoreció al local sin traducirse en claras ocasiones hasta el 2T.",
          "Ambos equipos sumaron 8 tarjetas amarillas; partido físicamente intenso.",
          "El visitante falló 2 ocasiones claras de cabeza en el primer tiempo.",
          "Cambio de esquema del local (4-3-3 → 4-2-3-1) en el entretiempo fue decisivo.",
        ],
        narrative:
          "Arrancó dominado por la visita, que generó varias llegadas sin gol. A mitad del 1T el equipo local se acomodó y encontró ritmo. El 0-0 aguantó hasta bien entrado el 2T, cuando una pérdida en la salida del balón visitante provocó el contraataque ganador. El visitante reaccionó pero no logró igualar. Partido con mucho ritmo, pocos goles pero mucho contenido táctico.",
      });
    }

    if (joined.includes("predicción") || joined.includes("prediction")) {
      return JSON.stringify({
        predictedHomeScore: 2,
        predictedAwayScore: 1,
        homeWinProbability: 48,
        drawProbability: 27,
        awayWinProbability: 25,
        explanation:
          "Pronóstico basado en la forma reciente de ambos equipos: el local suma 9 puntos en los últimos 4 partidos y mantiene 2 partidos consecutivos sin encajar goles de local. El visitante suele sufrir en los 15' finales de cada mitad. Resultado más probable: 2-1 local.",
      });
    }

    if (joined.includes("jugador") || joined.includes("player")) {
      return JSON.stringify({
        strengths: [
          "Excelente toma de decisiones en el último tercio del campo.",
          "Regate uno contra uno de alto rendimiento (78% de efectividad).",
          "Lectura táctica superior al promedio de la liga; anticipa 3-4 jugadas por partido.",
        ],
        weaknesses: [
          "Acierto en centros por banda por debajo de la media liga (22%).",
          "Defensivamente no cubre bien la espalda de su lateral cuando se adelanta.",
          "Resistencia: en los últimos 10' cae un 18% su intensidad.",
        ],
        performanceSummary:
          "Temporada muy sólida: 6 goles y 8 asistencias en 22 partidos jugados. Jugador decisivo en los partidos más difíciles; registra +1.2 G+A por 90 min en enfrentamientos contra equipos top-5.",
        outlook:
          "Pronóstico positivo: manteniendo la forma actual proyecta 12 goles + 14 asistencias al cierre de temporada. Ideal para sistema 4-3-3 como interior derecho o ala.",
      });
    }

    return JSON.stringify({
      ok: true,
      message:
        "Mock LLM: prompt no coincidió con patrones conocidos. Respuesta genérica válida para health check.",
    });
  }

  async chat(
    messages: ChatMessage[],
    options?: ChatOptions,
  ): Promise<string> {
    void options;
    // Simula una latencia chica para que los tests no parezcan instantáneos.
    await new Promise((r) => setTimeout(r, 10));
    return this.pick(messages);
  }
}
