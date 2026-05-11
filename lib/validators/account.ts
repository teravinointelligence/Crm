import { z } from "zod";
import {
  ACCOUNT_STATUSES,
  ACCOUNT_TYPES,
  REGIONS,
} from "@/types/database";

export const accountSchema = z.object({
  business_name: z.string().min(2, "Mínimo 2 caracteres"),
  account_type: z.enum(ACCOUNT_TYPES as [string, ...string[]]).optional(),
  region: z.enum(REGIONS as [string, ...string[]]).optional(),
  city: z.string().optional(),
  address: z.string().optional(),
  rfc: z.string().optional(),
  fiscal_name: z.string().optional(),
  price_tier: z.enum(["base", "+10"]).default("base"),
  assigned_rep_id: z.string().uuid().optional(),
  status: z.enum(ACCOUNT_STATUSES as [string, ...string[]]).default("prospecto"),
  notes: z.string().optional(),
});

export type AccountFormValues = z.infer<typeof accountSchema>;
