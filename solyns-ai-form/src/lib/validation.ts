import { z } from 'zod'

export const createStudySchema = z.object({
  title: z.string().min(1, 'Title is required').max(200, 'Title is too long'),
  objective: z.string().min(10, 'Objective must be at least 10 characters').max(2000, 'Objective is too long'),
  language: z.enum(['en', 'id']),
  company_name: z.string().max(100).optional(),
  additional_context: z.string().max(2000).optional(),
})

export const generateGuideSchema = z.object({
  objective: z.string().min(10, 'Objective must be at least 10 characters'),
  language: z.enum(['en', 'id']),
  company_name: z.string().optional(),
  additional_context: z.string().optional(),
})

export type CreateStudyInput = z.infer<typeof createStudySchema>
export type GenerateGuideInput = z.infer<typeof generateGuideSchema>
