import type {
  LLMProvider,
  ChatMessage,
  ChatOptions,
} from "@/types/ai";

export class MockLlmProvider implements LLMProvider {
  readonly id = "mock";
  readonly name = "Mock LLM Provider (offline fixtures)";

  private pick(msgs: ChatMessage[]): string {
    const rawContent = msgs.map((m) => m.content).join("\n\n");
    const joined = rawContent.toLowerCase();

    if (joined.includes("análisis del partido") || joined.includes("match analysis")) {
      const resultMatch = rawContent.match(/Resultado FINAL:\s*(.*?)\s+(\d+)\s*-\s*(\d+)\s+([^\n]+)/i);
      const homeTeam = resultMatch ? resultMatch[1].trim() : "Equipo Local";
      const hs = resultMatch ? parseInt(resultMatch[2], 10) : 1;
      const as = resultMatch ? parseInt(resultMatch[3], 10) : 0;
      const awayTeam = resultMatch ? resultMatch[4].trim() : "Equipo Visitante";

      const outcomeText = hs > as
        ? `Victoria de ${homeTeam} por ${hs}-${as}, capitalizando sus llegadas en campo rival.`
        : hs < as
          ? `Victoria de ${awayTeam} por ${as}-${hs}, imponiendo orden táctico y contundencia.`
          : `Empate ${hs}-${as} tras un trámite parejo y disputado en ambos tiempos.`;

      return JSON.stringify({
        summary: `Análisis del cruce entre ${homeTeam} y ${awayTeam}. ${outcomeText}`,
        keyInsights: [
          `${homeTeam} administró transiciones progresivas en la zona media.`,
          `${awayTeam} buscó profundidad aprovechando los repliegues defensivos.`,
          `Marcador final (${hs}-${as}) acorde al volumen de ocasiones generadas.`,
          "Lectura disciplinaria y física con intensidad constante a lo largo del partido.",
        ],
        narrative: `El duelo entre ${homeTeam} y ${awayTeam} ofreció un choque dinámico con respuestas estratégicas en ambos bandos. ${homeTeam} intentó imponer ritmo en los minutos iniciales, mientras ${awayTeam} respondió cerrando líneas y apostando a la aceleración en las bandas. El ${hs}-${as} definitivo consolida las señales de forma observadas en la temporada.`,
      });
    }

    if (joined.includes("predicción") || joined.includes("prediction")) {
      const localMatch = rawContent.match(/LOCAL:\s*([^\n(]+)/i);
      const visitaMatch = rawContent.match(/VISITA:\s*([^\n(]+)/i);
      const homeName = localMatch ? localMatch[1].trim() : "Local";
      const awayName = visitaMatch ? visitaMatch[1].trim() : "Visitante";

      const ptsHMatch = rawContent.match(new RegExp(`${homeName}[^\\n]*?PTS=(\\d+)`, "i"));
      const ptsAMatch = rawContent.match(new RegExp(`${awayName}[^\\n]*?PTS=(\\d+)`, "i"));
      const ptsH = ptsHMatch ? parseInt(ptsHMatch[1], 10) : 5;
      const ptsA = ptsAMatch ? parseInt(ptsAMatch[1], 10) : 4;

      let homeWinProb = 42;
      let drawProb = 30;
      let awayWinProb = 28;
      let predH = 2;
      let predA = 1;
      let explanation = `Pronóstico basado en las señales de forma: ${homeName} (${ptsH} pts) y ${awayName} (${ptsA} pts) presentan un cruce competitivo. Marcador más probable: ${predH}-${predA}.`;

      if (ptsH > ptsA + 2) {
        homeWinProb = 52;
        drawProb = 26;
        awayWinProb = 22;
        predH = 2;
        predA = 0;
        explanation = `Pronóstico favorable al anfitrión: ${homeName} lidera en puntos (${ptsH} pts) frente a ${awayName} (${ptsA} pts) y suma ventaja de localía. Resultado proyectado: ${predH}-${predA}.`;
      } else if (ptsA > ptsH + 2) {
        homeWinProb = 28;
        drawProb = 28;
        awayWinProb = 44;
        predH = 1;
        predA = 2;
        explanation = `Pronóstico con ventaja visitante: ${awayName} llega con mayor puntaje acumulado (${ptsA} pts) ante ${homeName} (${ptsH} pts), equilibrado por el factor cancha. Resultado proyectado: ${predH}-${predA}.`;
      }

      return JSON.stringify({
        predictedHomeScore: predH,
        predictedAwayScore: predA,
        homeWinProbability: homeWinProb,
        drawProbability: drawProb,
        awayWinProbability: awayWinProb,
        explanation,
      });
    }

    if (joined.includes("jugador") || joined.includes("player")) {
      const nameMatch = rawContent.match(/JUGADOR:\s*([^\n(]+)/i);
      const playerName = nameMatch ? nameMatch[1].trim() : "El jugador";

      return JSON.stringify({
        strengths: [
          `Toma de decisiones tácticas en el último tercio del campo para ${playerName}.`,
          "Precisión en pases progresivos y cambios de orientación.",
          "Lectura de juego para anticipar segundas jugadas en zona media.",
        ],
        weaknesses: [
          "Margen de mejora en la recuperación bajo presión alta.",
          "Cobertura de espacios defensivos en transiciones rápidas.",
          "Consistencia en la entrega durante el último cuarto de hora.",
        ],
        performanceSummary: `Muestra rendimiento consistente dentro de su rol, aportando regularidad en minutos y participación colectiva durante la presente campaña.`,
        outlook: `Proyección positiva orientada a consolidar su impacto en el esquema del equipo durante las próximas jornadas.`,
      });
    }

    return JSON.stringify({
      ok: true,
      message:
        "Mock LLM: prompt procesado con fallback genérico.",
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
