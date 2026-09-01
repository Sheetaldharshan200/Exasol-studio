// Raw engine/provider errors → something a person can act on. Pure mapping,
// safety net for anything the engine hasn't already made friendly; null means
// "no mapping — show the original".

export type FriendlyError = { title: string; action: string };

const RULES: { test: RegExp; friendly: FriendlyError }[] = [
  {
    test: /sign-in expired|Token refresh failed:?\s*(400|401|403)/i,
    friendly: {
      title: "Your provider sign-in expired.",
      action:
        "Sessions rotate when the same account signs in from another app or device. Reconnect in Providers (the plug icon), or run /connect in a session.",
    },
  },
  {
    test: /out of extra usage/i,
    friendly: {
      title: "The subscription's metered pool is empty.",
      action: "Your plan quota may still be fine — retry, and if it persists check the subscription's extra-usage settings.",
    },
  },
  {
    test: /too large to compact|context (length|window|limit)|maximum context/i,
    friendly: {
      title: "This conversation no longer fits the model's context window.",
      action: "Start a new chat, or switch to a model with a larger context window.",
    },
  },
  {
    test: /rate.?limit|\b429\b/i,
    friendly: {
      title: "The provider is rate-limiting requests.",
      action: "Wait a moment and retry, or switch to another model meanwhile.",
    },
  },
  {
    test: /overloaded|\b529\b/i,
    friendly: {
      title: "The provider is overloaded right now.",
      action: "Retry in a few seconds — this usually clears quickly.",
    },
  },
  {
    test: /invalid[ _]?api[ _]?key|incorrect api key|authentication_error/i,
    friendly: {
      title: "The API key was rejected.",
      action: "Re-enter the key in Providers — it may have been revoked or pasted with a typo.",
    },
  },
  {
    test: /ECONNREFUSED|ENOTFOUND|ETIMEDOUT|fetch failed|network error|socket hang up/i,
    friendly: {
      title: "Can't reach the model provider.",
      action: "Check your internet connection — and the network toggle next to the mode switcher if you turned web access off.",
    },
  },
];

export function humanizeEngineError(raw: string | undefined | null): FriendlyError | null {
  if (!raw) return null;
  for (const rule of RULES) if (rule.test.test(raw)) return rule.friendly;
  return null;
}
