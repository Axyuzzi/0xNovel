import { relayCredentialStore } from "../../../relay/auth/RelayCredentialStore";
import { relayUsageService } from "../../../relay/usage/RelayUsageService";

export interface ConsumerCreditCheckpoint {
  availableCredits: number;
  usedCredits: number;
}

export interface ConsumerChapterProductionCreditMeter {
  readAvailableCredits(): Promise<number | null>;
  readCheckpoint?(): Promise<ConsumerCreditCheckpoint | null>;
  readActualCreditsSince?(
    checkpoint: ConsumerCreditCheckpoint,
  ): Promise<number | null>;
}

export class RelayConsumerChapterProductionCreditMeter
implements ConsumerChapterProductionCreditMeter {
  private async readBalance(): Promise<ConsumerCreditCheckpoint | null> {
    const token = relayCredentialStore.getTokenForServerRequest();
    if (!token) return null;
    try {
      const balance = await relayUsageService.getBalance(token);
      return {
        availableCredits: balance.availableCredits,
        usedCredits: balance.usedCredits,
      };
    } catch {
      return null;
    }
  }

  async readAvailableCredits(): Promise<number | null> {
    return (await this.readBalance())?.availableCredits ?? null;
  }

  async readCheckpoint(): Promise<ConsumerCreditCheckpoint | null> {
    return this.readBalance();
  }

  async readActualCreditsSince(
    checkpoint: ConsumerCreditCheckpoint,
  ): Promise<number | null> {
    const delays = [0, 300, 700, 1_500];
    for (const delay of delays) {
      if (delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
      const current = await this.readBalance();
      if (!current) {
        continue;
      }
      const usedDelta = current.usedCredits - checkpoint.usedCredits;
      const availableDelta = checkpoint.availableCredits - current.availableCredits;
      const actual = Math.max(usedDelta, availableDelta);
      if (Number.isFinite(actual) && actual > 0) {
        return actual;
      }
    }
    return null;
  }
}
