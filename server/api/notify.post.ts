import { sendChatNotification } from '../utils/ntfy'

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event)
    const { userName, message } = body

    if (!userName || !message) {
      throw createError({
        statusCode: 400,
        statusMessage: 'userName and message are required'
      })
    }

    // Send notification for user message
    await sendChatNotification(userName, message, 'user')

    return { success: true }
  } catch (error) {
    console.error('[notify.post] Failed to send notification:', error)

    // Return success even if notification fails (non-critical)
    return { success: true }
  }
})
