import type { ChatMessage } from './useChatState'

export interface SlashCommand {
  name: string
  description: string
  usage: string
  type: 'local' | 'server'
  handler: (args: string[], context: CommandContext) => Promise<void> | void
}

export interface CommandContext {
  addMessage: (message: ChatMessage) => void
  clearMessages: () => void
  userName: Ref<string | null>
  clientId: Ref<string | null>
}

export const useSlashCommands = () => {
  const { addMessage, clearMessages } = useChatState()
  const { userName, clientId } = useUser()
  const { clearChat } = useChatActions()
  const toast = useToast()

  // Command registry
  const commands = new Map<string, SlashCommand>()

  // Register /clear command
  commands.set('clear', {
    name: 'clear',
    description: 'Clear chat history for all participants',
    usage: '/clear',
    type: 'server',
    handler: async (_args, _context) => {
      try {
        // Use WebSocket to clear chat for everyone
        await clearChat()
      } catch (error) {
        console.error('Failed to clear chat:', error)
        toast.add({
          title: 'Error',
          description: 'Failed to clear chat for all participants',
          color: 'error'
        })
      }
    }
  })

  // Register /help command
  commands.set('help', {
    name: 'help',
    description: 'Show available commands',
    usage: '/help',
    type: 'local',
    handler: (args, context) => {
      const commandList = Array.from(commands.values())
        .map(cmd => `• **/${cmd.name}** - ${cmd.description}\n  Usage: \`${cmd.usage}\``)
        .join('\n\n')

      const helpMessage: ChatMessage = {
        id: `help-${Date.now()}`,
        userId: 'system',
        userName: 'System',
        content: `**Available Commands:**\n\n${commandList}`,
        timestamp: Date.now(),
        type: 'system',
        status: 'sent'
      }
      context.addMessage(helpMessage)
    }
  })

  // Parse command from input
  const parseCommand = (input: string): { command: string, args: string[] } | null => {
    if (!input.startsWith('/')) return null

    const parts = input.slice(1).trim().split(/\s+/)
    if (parts.length === 0 || !parts[0]) return null

    return {
      command: parts[0].toLowerCase(),
      args: parts.slice(1)
    }
  }

  // Check if input is a command
  const isCommand = (input: string): boolean => {
    return input.startsWith('/')
  }

  // Execute a command
  const executeCommand = async (input: string): Promise<boolean> => {
    const parsed = parseCommand(input)
    if (!parsed) return false

    const command = commands.get(parsed.command)
    if (!command) {
      // Unknown command
      const errorMessage: ChatMessage = {
        id: `error-${Date.now()}`,
        userId: 'system',
        userName: 'System',
        content: `Unknown command: /${parsed.command}. Type /help for available commands.`,
        timestamp: Date.now(),
        type: 'system',
        status: 'sent'
      }
      addMessage(errorMessage)
      return true // Still handled as a command
    }

    // Create context for command execution
    const context: CommandContext = {
      addMessage,
      clearMessages,
      userName,
      clientId
    }

    try {
      // Execute the command
      await command.handler(parsed.args, context)
      return true
    } catch (error) {
      console.error(`Error executing command /${command.name}:`, error)

      const errorMessage: ChatMessage = {
        id: `error-${Date.now()}`,
        userId: 'system',
        userName: 'System',
        content: `Error executing command: /${command.name}`,
        timestamp: Date.now(),
        type: 'system',
        status: 'sent'
      }
      addMessage(errorMessage)

      toast.add({
        title: 'Command Error',
        description: `Failed to execute /${command.name}`,
        color: 'error'
      })

      return true
    }
  }

  // Get command suggestions for autocomplete
  const getCommandSuggestions = (input: string): SlashCommand[] => {
    if (!input.startsWith('/')) return []

    const search = input.slice(1).toLowerCase()
    if (!search) {
      // Return all commands if just "/"
      return Array.from(commands.values())
    }

    // Return commands that start with the search term
    return Array.from(commands.values())
      .filter(cmd => cmd.name.toLowerCase().startsWith(search))
  }

  return {
    commands: readonly(commands),
    isCommand,
    parseCommand,
    executeCommand,
    getCommandSuggestions
  }
}
