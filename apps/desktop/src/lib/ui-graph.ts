// The UI navigation graph: components are nodes, interactions are weighted
// edges. Paths are found like a route planner — bidirectional Dijkstra from
// the current position AND back from the goal — and executed step by step.
// A failing step blocks its edge and the route RECALCULATES from where the
// agent actually is, taking the best diversion (or reporting exactly where
// it got stuck).

export type UiEdge = {
  from: string;
  to: string;
  weight: number;
  label: string;
  /** Perform the interaction; false = blocked (missing anchor, error). */
  action: () => Promise<boolean>;
  blocked?: boolean;
};

export type UiNode = {
  id: string;
  /** Optional truth-check that the app really is in this state. */
  verify?: () => boolean;
};

export class UiGraph {
  private nodes = new Map<string, UiNode>();
  private edges: UiEdge[] = [];

  node(n: UiNode) {
    this.nodes.set(n.id, n);
    return this;
  }

  edge(e: UiEdge) {
    if (!this.nodes.has(e.from)) this.nodes.set(e.from, { id: e.from });
    if (!this.nodes.has(e.to)) this.nodes.set(e.to, { id: e.to });
    // No duplicate roads: same from→to keeps only the cheaper edge.
    const dup = this.edges.find((x) => x.from === e.from && x.to === e.to);
    if (dup) {
      if (e.weight < dup.weight) Object.assign(dup, e);
      return this;
    }
    this.edges.push(e);
    return this;
  }

  /** Dijkstra distances over (optionally reversed) unblocked edges. */
  private distances(source: string, reverse: boolean): Map<string, { d: number; via?: UiEdge }> {
    const dist = new Map<string, { d: number; via?: UiEdge }>();
    dist.set(source, { d: 0 });
    const queue: string[] = [source];
    while (queue.length) {
      queue.sort((a, b) => (dist.get(a)?.d ?? Infinity) - (dist.get(b)?.d ?? Infinity));
      const u = queue.shift()!;
      const du = dist.get(u)!.d;
      for (const e of this.edges) {
        if (e.blocked) continue;
        const [a, b] = reverse ? [e.to, e.from] : [e.from, e.to];
        if (a !== u) continue;
        const nd = du + e.weight;
        if (nd < (dist.get(b)?.d ?? Infinity)) {
          dist.set(b, { d: nd, via: e });
          queue.push(b);
        }
      }
    }
    return dist;
  }

  /** Bidirectional search: meet-in-the-middle over forward + backward frontiers. */
  path(from: string, to: string): UiEdge[] | null {
    const fwd = this.distances(from, false);
    const bwd = this.distances(to, true);
    let best: { node: string; d: number } | null = null;
    for (const [node, f] of fwd) {
      const b = bwd.get(node);
      if (b && (!best || f.d + b.d < best.d)) best = { node, d: f.d + b.d };
    }
    if (!best) return null;
    // Reconstruct: from → meet (via fwd parents), meet → to (via bwd parents).
    const first: UiEdge[] = [];
    for (let n = best.node; n !== from; ) {
      const via = fwd.get(n)?.via;
      if (!via) break;
      first.unshift(via);
      n = via.from;
    }
    const second: UiEdge[] = [];
    for (let n = best.node; n !== to; ) {
      const via = bwd.get(n)?.via;
      if (!via) break;
      second.push(via);
      n = via.to;
    }
    return [...first, ...second];
  }

  /**
   * Navigate with rerouting: execute the best path; when a step fails, block
   * that edge and recalculate from the CURRENT node — the diversion. Gives an
   * honest final position either way.
   */
  async navigate(
    from: string,
    to: string,
    onStep?: (e: UiEdge) => void,
  ): Promise<{ ok: boolean; at: string; detail?: string }> {
    let current = from;
    for (let reroutes = 0; reroutes < 6; reroutes++) {
      const route = this.path(current, to);
      if (!route || route.length === 0) {
        return current === to
          ? { ok: true, at: current }
          : { ok: false, at: current, detail: `No remaining route from "${current}" to "${to}".` };
      }
      let detour = false;
      for (const e of route) {
        onStep?.(e);
        let ok = false;
        try {
          ok = await e.action();
        } catch (err) {
          // A thrown error is a DOMAIN failure (bad credentials, DB rejected)
          // — not a wrong turn. Rerouting won't help; report it truthfully.
          return { ok: false, at: current, detail: err instanceof Error ? err.message : String(err) };
        }
        const verified = ok && (this.nodes.get(e.to)?.verify?.() ?? true);
        if (!verified) {
          e.blocked = true; // road closed — recalculate from here
          detour = true;
          break;
        }
        current = e.to;
      }
      if (!detour) return { ok: current === to, at: current };
    }
    return { ok: false, at: current, detail: "Exhausted reroutes — every alternative was blocked." };
  }

  /** Reopen all roads (fresh attempt). */
  reset() {
    for (const e of this.edges) e.blocked = false;
  }
}
