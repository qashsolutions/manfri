// Deterministic skill lexicon + matcher — ported verbatim from the Python
// services/api/app/parsing/skills.py (EXTRACTION_REPORT §3). A fixed, versioned,
// precision-biased canonical→aliases map; matching is case-insensitive and
// edge-bounded on alphanumerics (so C++, C#, Node.js, k8s resolve cleanly).

export const SKILL_DICTIONARY_VERSION = "skills@1";

const SKILLS: Record<string, readonly string[]> = {
  Python: ["python"],
  JavaScript: ["javascript"],
  TypeScript: ["typescript"],
  Java: ["java"],
  Go: ["golang"],
  Rust: ["rust"],
  "C++": ["c++", "cpp"],
  "C#": ["c#", "csharp"],
  Ruby: ["ruby"],
  PHP: ["php"],
  Swift: ["swift"],
  Kotlin: ["kotlin"],
  Scala: ["scala"],
  SQL: ["sql"],
  PostgreSQL: ["postgresql", "postgres"],
  MySQL: ["mysql"],
  MongoDB: ["mongodb"],
  Redis: ["redis"],
  React: ["react", "reactjs", "react.js"],
  "Next.js": ["next.js", "nextjs"],
  Vue: ["vue.js", "vuejs"],
  Angular: ["angular"],
  "Node.js": ["node.js", "nodejs"],
  Django: ["django"],
  FastAPI: ["fastapi"],
  Flask: ["flask"],
  Spring: ["spring boot", "springboot"],
  AWS: ["aws", "amazon web services"],
  GCP: ["gcp", "google cloud"],
  Azure: ["azure"],
  Docker: ["docker"],
  Kubernetes: ["kubernetes", "k8s"],
  Terraform: ["terraform"],
  Git: ["git"],
  GraphQL: ["graphql"],
  Kafka: ["kafka"],
  Spark: ["apache spark"],
  "Machine Learning": ["machine learning"],
  "Deep Learning": ["deep learning"],
  TensorFlow: ["tensorflow"],
  PyTorch: ["pytorch"],
  Pandas: ["pandas"],
  NumPy: ["numpy"],
  Linux: ["linux"],
  Tableau: ["tableau"],
  "Power BI": ["power bi", "powerbi"],
  Salesforce: ["salesforce"],
  Figma: ["figma"],
  Excel: ["microsoft excel"],
};

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// One edge-bounded, case-insensitive pattern per canonical skill. Edges are bounded
// on alphanumerics only (mirrors the Python: `(?<![A-Za-z0-9])(?:alts)(?![A-Za-z0-9])`),
// so punctuated names (C++, C#, Node.js) match without a trailing '.'/'+'/'#' blocking it.
const COMPILED: ReadonlyArray<readonly [string, RegExp]> = Object.entries(SKILLS).map(
  ([canonical, aliases]) => {
    const alts = [...aliases]
      .map(escapeRegExp)
      .sort((a, b) => b.length - a.length)
      .join("|");
    return [canonical, new RegExp(`(?<![A-Za-z0-9])(?:${alts})(?![A-Za-z0-9])`, "i")] as const;
  },
);

/** Canonical skills present in `text` (sorted, de-duplicated). */
export function findSkills(text: string): string[] {
  const found = new Set<string>();
  for (const [canonical, pattern] of COMPILED) {
    if (pattern.test(text)) found.add(canonical);
  }
  return [...found].sort();
}
