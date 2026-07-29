import {
  normalizeRelayApiKey,
  type RelayUserSummary,
} from "@0xnovelagent/shared/types/relay";

export interface RelayCredentialSnapshot {
  token: string;
  user?: RelayUserSummary;
}

class RelayCredentialStore {
  private snapshot: Required<RelayCredentialSnapshot> | null = null;

  setAuthenticatedSession(snapshot: Required<RelayCredentialSnapshot>): void {
    const token = normalizeRelayApiKey(snapshot.token);

    this.snapshot = {
      token,
      user: {
        id: snapshot.user.id.trim(),
        username: snapshot.user.username.trim(),
        displayName: snapshot.user.displayName.trim() || snapshot.user.username.trim(),
      },
    };
  }

  clear(): void {
    this.snapshot = null;
  }

  getUser(): RelayUserSummary | null {
    return this.snapshot ? { ...this.snapshot.user } : null;
  }

  getTokenForServerRequest(): string | null {
    return this.snapshot?.token ?? null;
  }

  getSnapshotForCredentialBroker(): Required<RelayCredentialSnapshot> | null {
    return this.snapshot
      ? {
          token: this.snapshot.token,
          user: { ...this.snapshot.user },
        }
      : null;
  }

  requireTokenForServerRequest(): string {
    const token = this.getTokenForServerRequest();
    if (!token) {
      throw new Error("登录后才能使用 AI 创作服务。");
    }
    return token;
  }
}

export const relayCredentialStore = new RelayCredentialStore();
