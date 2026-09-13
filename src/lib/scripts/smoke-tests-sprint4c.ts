import { parseEntityId } from "@/lib/config/validation";
import { existsSync } from "node:fs";
import { readFileSync } from "node:fs";

let passed = 0;
let failed = 0;

function check(name: string, condition: boolean, details?: string): void {
  if (condition) {
    console.log(`[PASS] ${name}`);
    passed++;
  } else {
    console.log(`[FAIL] ${name}${details ? ` - ${details}` : ""}`);
    failed++;
  }
}

async function runTests(): Promise<void> {
  console.log("=== SMOKE TESTS — Sprint 4C (Perceived Performance) ===\n");

  const cwd = process.cwd();

  // A. Boundaries correctas existen
  console.log("--- A. Boundaries correctas existen ---");
  check("A1: sport/loading.tsx exists", existsSync(`${cwd}/src/app/[sport]/loading.tsx`));
  check("A2: matches/loading.tsx exists", existsSync(`${cwd}/src/app/[sport]/matches/loading.tsx`));
  check("A3: matches/[id]/loading.tsx exists", existsSync(`${cwd}/src/app/[sport]/matches/[id]/loading.tsx`));
  check("A4: leaderboard/loading.tsx exists", existsSync(`${cwd}/src/app/[sport]/leaderboard/loading.tsx`));
  check("A5: players/loading.tsx exists", existsSync(`${cwd}/src/app/[sport]/players/loading.tsx`));
  check("A6: predictions/loading.tsx exists", existsSync(`${cwd}/src/app/[sport]/predictions/loading.tsx`));

  // B. Boundaries incorrectas NO existen
  console.log("\n--- B. Boundaries incorrectas NO existen ---");
  check("B1: ranking/loading.tsx NOT exists", !existsSync(`${cwd}/src/app/[sport]/ranking/loading.tsx`));
  check("B2: squads/loading.tsx NOT exists", !existsSync(`${cwd}/src/app/[sport]/squads/loading.tsx`));

  // C. Skeleton components
  console.log("\n--- C. Skeleton components ---");
  const skeletonDir = `${cwd}/src/components/skeletons`;
  check("C1: page-loading-shell.tsx exists", existsSync(`${skeletonDir}/page-loading-shell.tsx`));
  check("C2: skeleton-block.tsx exists", existsSync(`${skeletonDir}/skeleton-block.tsx`));
  check("C3: skeleton-line.tsx exists", existsSync(`${skeletonDir}/skeleton-line.tsx`));

  // C4-C7: No "use client" in skeleton components
  const shellContent = readFileSync(`${skeletonDir}/page-loading-shell.tsx`, "utf8");
  const blockContent = readFileSync(`${skeletonDir}/skeleton-block.tsx`, "utf8");
  const lineContent = readFileSync(`${skeletonDir}/skeleton-line.tsx`, "utf8");

  check("C4: page-loading-shell.tsx NO 'use client'", !/use client/.test(shellContent));
  check("C5: skeleton-block.tsx NO 'use client'", !/use client/.test(blockContent));
  check("C6: skeleton-line.tsx NO 'use client'", !/use client/.test(lineContent));

  // C8: PageLoadingShell aplica className
  check("C8: PageLoadingShell uses className", /className.*\$\{className/.test(shellContent));
  check("C9: SkeletonBlock uses className", /className.*\$\{className/.test(blockContent));
  check("C10: SkeletonLine uses className", /className.*\$\{className/.test(lineContent));

  // C11: aria attributes presentes
  check("C11: PageLoadingShell aria-busy", /aria-busy.*true/.test(shellContent));
  check("C12: PageLoadingShell aria-label", /aria-label.*Cargando/.test(shellContent));
  check("C13: PageLoadingShell role=status", /role.*status/.test(shellContent));
  check("C14: SkeletonBlock aria-hidden", /aria-hidden.*true/.test(blockContent));
  check("C15: SkeletonLine aria-hidden", /aria-hidden.*true/.test(lineContent));

  // C16: Visual classes - background visible
  check("C16: SkeletonBlock has visible bg-slate-800/70", /bg-slate-800\/70/.test(blockContent));
  check("C17: SkeletonLine has visible bg-slate-700/70", /bg-slate-700\/70/.test(lineContent));
  check("C18: SkeletonBlock NO custom 'skeleton-block' class", !/skeleton-block/.test(blockContent));
  check("C19: SkeletonLine NO custom 'skeleton-line' class", !/skeleton-line/.test(lineContent));
  check("C20: PageLoadingShell NO custom 'skeleton' class", !/skeleton\b/.test(shellContent.replace(/\/\*.*?\*\//g, '')));

  // D. No fake sports data in loading files
  console.log("\n--- D. No fake sports data ---");
  const loadingFiles = [
    `${cwd}/src/app/[sport]/loading.tsx`,
    `${cwd}/src/app/[sport]/matches/loading.tsx`,
    `${cwd}/src/app/[sport]/matches/[id]/loading.tsx`,
    `${cwd}/src/app/[sport]/leaderboard/loading.tsx`,
    `${cwd}/src/app/[sport]/players/loading.tsx`,
    `${cwd}/src/app/[sport]/predictions/loading.tsx`,
  ];

  for (const file of loadingFiles) {
    if (existsSync(file)) {
      const content = readFileSync(file, "utf8");
      const hasFakeData = /equipo|team|player|score|probabil|cuota|pick|predicc|stat|jugador|partido|match|goal|goles|asist/i.test(content);
      check(`D: ${file.split("/").pop()} no fake data`, !hasFakeData);
    }
  }

  // E. No GPU-intensive patterns
  console.log("\n--- E. No GPU-intensive patterns ---");
  const allSkeletonFiles = [
    `${skeletonDir}/page-loading-shell.tsx`,
    `${skeletonDir}/skeleton-block.tsx`,
    `${skeletonDir}/skeleton-line.tsx`,
  ];
  for (const file of allSkeletonFiles) {
    if (existsSync(file)) {
      const content = readFileSync(file, "utf8");
      const hasGPU = /animation:|infinite|backdrop-filter|blur\(|box-shadow.*anim/.test(content);
      check(`E: ${file.split("/").pop()} no GPU patterns`, !hasGPU);
    }
  }
  for (const file of loadingFiles) {
    if (existsSync(file)) {
      const content = readFileSync(file, "utf8");
      const hasGPU = /animation:|infinite|backdrop-filter|blur\(|box-shadow.*anim/.test(content);
      check(`E: ${file.split("/").pop()} no GPU patterns`, !hasGPU);
    }
  }

  // F. Viewport: no 100vh, no min-h-[var(--vh-100)]
  console.log("\n--- F. Viewport fixes ---");
  for (const file of loadingFiles) {
    if (existsSync(file)) {
      const content = readFileSync(file, "utf8");
      const hasBadViewport = /100vh|min-h-\[var\(--vh-100\)\]/.test(content);
      check(`F: ${file.split("/").pop()} no 100vh/var(--vh-100)`, !hasBadViewport);
    }
  }
  // F: match detail uses 100dvh - 4rem
  const matchDetail = readFileSync(`${cwd}/src/app/[sport]/matches/[id]/loading.tsx`, "utf8");
  check("F: match detail uses 100dvh - 4rem", /100dvh.*4rem/.test(matchDetail));

  console.log("\n======================================================================");
  console.log(
    `RESULTADO FINAL SPRINT 4C: ${failed === 0 ? "TODOS LOS TESTS PASARON ✅✅✅" : `${failed} FALLARON ❌`}`,
  );
  console.log(`Pasaron: ${passed}, Fallaron: ${failed}`);
  console.log("======================================================================");

  if (failed > 0) process.exit(1);
}

runTests().catch((e) => {
  console.error(e);
  process.exit(1);
});