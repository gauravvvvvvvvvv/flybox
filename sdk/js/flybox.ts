export class Flybox {
  constructor(public baseUrl = "http://localhost:8000") {}

  private async request(path: string, method = "GET", body?: unknown) {
    const response = await fetch(this.baseUrl.replace(/\/$/, "") + path, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!response.ok) throw new Error(await response.text());
    return response.json();
  }

  state() { return this.request("/api/state"); }
  resume() { return this.request("/api/simulation/resume", "POST"); }
  pause() { return this.request("/api/simulation/pause", "POST"); }
  step() { return this.request("/api/simulation/step", "POST"); }

  spawn(name?: string, body = "fly") {
    const query = new URLSearchParams({ body_type: body });
    if (name) query.set("name", name);
    return this.request("/api/flies?" + query, "POST");
  }

  stimulate(flyId: string, population: string, amount = 0.8) {
    return this.request(`/api/flies/${flyId}/interventions`, "POST", {
      type: "stimulate_population",
      target: population,
      amount,
    });
  }

  silence(flyId: string, population: string) {
    return this.request(`/api/flies/${flyId}/interventions`, "POST", {
      type: "silence_population",
      target: population,
    });
  }

  add(kind: string, x: number, y: number, extra: Record<string, unknown> = {}) {
    return this.request("/api/world", "POST", { kind, x, y, ...extra });
  }

  challenge(id: string) {
    return this.request(`/api/challenges/${id}`, "POST");
  }

  console(command: string) {
    return this.request("/api/console", "POST", { command });
  }
}
