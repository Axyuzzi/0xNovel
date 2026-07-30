import { prisma } from "../../../db/prisma";
import { RelayConsumerSetupCreditMeter } from "./setupCreditMeter";
import { PromptConsumerSetupGenerator } from "./setupGenerator";
import { ConsumerSetupService } from "./setupService";

export const consumerSetupService = new ConsumerSetupService(
  prisma,
  new PromptConsumerSetupGenerator(),
  new RelayConsumerSetupCreditMeter(),
);
