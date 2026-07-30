import { prisma } from "../../../db/prisma";
import { ConsumerWorkspaceService } from "./workspaceService";

export const consumerWorkspaceService = new ConsumerWorkspaceService(prisma);
