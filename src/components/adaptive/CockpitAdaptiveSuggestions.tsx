"use client";

import { useState } from "react";
import { AdaptiveSuggestionStack } from "@/components/adaptive/AdaptiveSuggestionStack";
import { trackAdaptiveEvent } from "@/lib/adaptive/trackAdaptiveEvent";
import type { AdaptiveSuggestionState } from "@/types/adaptive";

type Props = {
  initialSuggestions: AdaptiveSuggestionState[];
};

export function CockpitAdaptiveSuggestions({ initialSuggestions }: Props) {
  const [suggestions, setSuggestions] = useState<AdaptiveSuggestionState[]>(initialSuggestions);

  if (suggestions.length === 0) return null;

  async function resolveSuggestion(suggestion: AdaptiveSuggestionState, action: "accept" | "dismiss") {
    await fetch(`/api/adaptive/suggestions/${suggestion.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    setSuggestions((prev) => prev.filter((item) => item.id !== suggestion.id));
    void trackAdaptiveEvent({
      eventType: action === "accept" ? "adaptive_suggestion_accepted" : "adaptive_suggestion_dismissed",
      route: "/cockpit",
      payload: {
        suggestionId: suggestion.id,
        kind: suggestion.kind,
      },
    });
  }

  return (
    <AdaptiveSuggestionStack
      title="AXE can personalize this further"
      suggestions={suggestions}
      onAccept={(suggestion) => resolveSuggestion(suggestion, "accept")}
      onDismiss={(suggestion) => resolveSuggestion(suggestion, "dismiss")}
    />
  );
}
