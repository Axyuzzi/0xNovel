import { relayCredentialStore } from "../../../relay/auth/RelayCredentialStore";
import { relayUsageService } from "../../../relay/usage/RelayUsageService";

export interface ConsumerSetupCreditMeter {
  readAvailableCredits(): Promise<number | null>;
}

export class RelayConsumerSetupCreditMeter implements ConsumerSetupCreditMeter {
  async readAvailableCredits(): Promise<number | null> {
    const token = relayCredentialStore.getTokenForServerRequest();
    if (!token) {
      return null;
    }
    try {
      const balance = await relayUsageService.getBalance(token);
      return balance.availableCredits;
    } catch {
      return null;
    }
  }
}
