import 'server-only'
import { prisma } from '../db'
import { configuredEnv, mockProvidersAllowed } from '../runtime-mode'

export interface EmailNotification {
  userId?: string
  to: string
  subject: string
  html: string
  text: string
  template: string
  dedupeKey: string
}

/** Idempotent, audited email delivery. Provider failures do not lose the log. */
export async function sendEmailNotification(input: EmailNotification): Promise<{ sent: boolean; duplicate?: boolean }> {
  const existing = await prisma.notificationLog.findUnique({ where: { dedupeKey: input.dedupeKey } })
  if (existing?.status === 'sent' || existing?.status === 'mocked') return { sent: true, duplicate: true }

  const log = existing ?? await prisma.notificationLog.create({
    data: {
      userId: input.userId,
      channel: 'email',
      recipient: input.to.trim().toLowerCase(),
      template: input.template,
      dedupeKey: input.dedupeKey,
      status: 'pending',
    },
  })

  if (!configuredEnv('RESEND_API_KEY') || !configuredEnv('EMAIL_FROM')) {
    if (!mockProvidersAllowed()) {
      await prisma.notificationLog.update({ where: { id: log.id }, data: { status: 'failed', error: 'Resend is not configured' } })
      return { sent: false }
    }
    await prisma.notificationLog.update({ where: { id: log.id }, data: { status: 'mocked', sentAt: new Date(), error: null } })
    return { sent: true }
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [input.to], subject: input.subject, html: input.html, text: input.text }),
    })
    if (!res.ok) throw new Error(`Resend returned ${res.status}`)
    await prisma.notificationLog.update({ where: { id: log.id }, data: { status: 'sent', sentAt: new Date(), error: null } })
    return { sent: true }
  } catch (err) {
    await prisma.notificationLog.update({ where: { id: log.id }, data: { status: 'failed', error: String(err).slice(0, 500) } })
    return { sent: false }
  }
}
