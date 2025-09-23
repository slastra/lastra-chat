interface NtfyOptions {
  title?: string
  priority?: 'max' | 'urgent' | 'high' | 'default' | 'low' | 'min'
  tags?: string[]
  click?: string
  icon?: string
}

/**
 * Send a notification to ntfy.sh
 */
export async function sendNtfyNotification(
  message: string,
  options: NtfyOptions = {}
): Promise<void> {
  const runtimeConfig = useRuntimeConfig()
  const ntfyUrl = runtimeConfig.ntfyUrl || 'https://ntfy.sh'
  const topic = runtimeConfig.ntfyTopic || 'chat-notifications'
  const url = `${ntfyUrl}/${topic}`

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'text/plain'
    }

    // Add optional headers
    if (options.title) {
      headers['Title'] = options.title
    }

    if (options.priority) {
      headers['Priority'] = options.priority
    }

    if (options.tags && options.tags.length > 0) {
      headers['Tags'] = options.tags.join(',')
    }

    if (options.click) {
      headers['Click'] = options.click
    }

    if (options.icon) {
      headers['Icon'] = options.icon
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: message
    })

    if (!response.ok) {
      // Failed to send notification - non-critical error
    } else {
      // Notification sent successfully
    }
  } catch (error) {
    console.error('[ntfy] Failed to send notification:', error)
  }
}

/**
 * Send a chat message notification
 */
export async function sendChatNotification(
  userName: string,
  message: string,
  type: 'user' | 'ai' | 'system' = 'user'
) {
  // Block notifications from specific users and bots
  if (userName.toLowerCase() === 'shaun' || type === 'ai') {
    return
  }

  // Truncate long messages
  const truncatedMessage = message.length > 200
    ? message.substring(0, 197) + '...'
    : message

  // Determine priority based on type
  let priority: NtfyOptions['priority'] = 'default'

  switch (type as 'user' | 'ai' | 'system') {
    case 'ai':
      priority = 'low'
      break
    case 'system':
      priority = 'min'
      break
    case 'user':
      priority = 'default'
      break
  }

  // Get site URL from environment variable or use fallback
  const runtimeConfig = useRuntimeConfig()
  const siteUrl = runtimeConfig.public.siteUrl || 'https://lastra.us'
  const iconUrl = `${siteUrl}/favicon-32x32.png`

  await sendNtfyNotification(
    `${userName}: ${truncatedMessage}`,
    {
      title: 'Lastra Chat',
      priority,
      icon: iconUrl
    }
  )
}
