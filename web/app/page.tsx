export default function Home() {
  return (
    <main style={{ fontFamily: "system-ui, sans-serif", maxWidth: 640, margin: "4rem auto", padding: "0 1rem" }}>
      <h1>ManFriday</h1>
      <p>Phase 0 walking skeleton. No screening, scoring, or triage logic here yet.</p>
      <p>
        BFF liveness probe: <code>/api/health</code>
      </p>
    </main>
  );
}
