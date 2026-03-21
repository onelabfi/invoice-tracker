export interface OnboardingState {
  name: string | null;
  language: string | null;
  bank_connected: boolean;
  onboarded: boolean;
}

const STORAGE_KEY = "ricordo-onboarding";

const DEFAULT_STATE: OnboardingState = {
  name: null,
  language: null,
  bank_connected: false,
  onboarded: false,
};

export function getOnboardingState(): OnboardingState {
  if (typeof window === "undefined") return DEFAULT_STATE;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_STATE;
    return { ...DEFAULT_STATE, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_STATE;
  }
}

export function setOnboardingState(partial: Partial<OnboardingState>): OnboardingState {
  const current = getOnboardingState();
  const updated = { ...current, ...partial };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  return updated;
}

export function isOnboarded(): boolean {
  return getOnboardingState().onboarded;
}
