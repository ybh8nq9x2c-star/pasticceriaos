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
});

export type SignUpInput     = z.infer<typeof signUpSchema>;
export type SignInInput     = z.infer<typeof signInSchema>;
export type OnboardingInput = z.infer<typeof onboardingSchema>;
