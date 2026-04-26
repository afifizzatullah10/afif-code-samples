import type { DiscussionGuide, Form } from '@/lib/types'

function guideHasAiFollowUps(guide: DiscussionGuide | null | undefined): boolean {
  if (!guide?.questions?.length) return false
  return guide.questions.some(
    q => q.ai_follow_up_enabled === true && (q.max_follow_ups ?? 0) > 0
  )
}

/** Tooltip copy for forms that use AI (generated guide and/or adaptive follow-ups). */
export function formAiBadgeTitle(form: Pick<Form, 'discussion_guide'>): string | null {
  const g = form.discussion_guide
  if (!g) return null
  const fromAi = g.created_with_ai === true
  const followUps = guideHasAiFollowUps(g)
  if (!fromAi && !followUps) return null
  if (fromAi && followUps) return 'AI-generated form with adaptive follow-ups'
  if (fromAi) return 'AI-generated form'
  return 'Includes AI follow-ups'
}
