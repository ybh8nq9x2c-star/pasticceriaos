// =============================================================================
// modules/identity/schemas.ts
// Zod schemas per validazione input identity (auth + onboarding).
// =============================================================================

import { z } from 'zod';

export const signUpSchema = z.object({
  email: z
    .string()
    .email('Email non valida')
    .toLowerCase(),
  password: z
    .string()
    .min(8, 'La password deve essere almeno 8 caratteri')
    .max(72, 'Password troppo lunga'),
  // Il nome dell'org viene raccolto nell'onboarding, non al signup
});

export const signInSchema = z.object({
  email: z
    .string()
    .email('Email non valida')
    .toLowerCase(),
  password: z
    .string()
    .min(1, 'Inserisci la password'),
});

export const onboardingSchema = z.object({
  orgName: z
    .string()
    .trim()
    .min(2, 'Il nome deve essere almeno 2 caratteri')
    .max(100, 'Il nome è troppo lungo'),
  city: z
    .string()
    .trim()
    .max(100, 'Città troppo lunga')
    .optional(),
  email: z
    .string()
    .email('Email non valida')
    .optional()
    .or(z.literal('')),
  accountType: z.enum(['customer', 'supplier'], {
    errorMap: () => ({ message: 'Seleziona il tipo di account' }),
  }),
  // Profilo fiscale (opzionale in onboarding). In V1 denominazione/forma sono
  // manuali; la P.IVA è validata via checksum nel service. Onboarding mai bloccato.
  vatNumber:  z.string().trim().max(30).optional(),
  vatCountry: z.string().trim().length(2).optional(),
  legalName:  z.string().trim().max(200).optional(),
  legalForm:  z.string().trim().max(40).optional(),
});

export type SignUpInput     = z.infer<typeof signUpSchema>;
export type SignInInput     = z.infer<typeof signInSchema>;
export type OnboardingInput = z.infer<typeof onboardingSchema>;
