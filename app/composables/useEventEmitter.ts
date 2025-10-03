export function useEventEmitter() {
  const eventHandlers = new Map<string, Set<(...args: unknown[]) => void>>()

  function emit(event: string, ...args: unknown[]) {
    const handlers = eventHandlers.get(event)
    if (handlers) {
      handlers.forEach(handler => handler(...args))
    }
  }

  function on(event: string, handler: (...args: unknown[]) => void) {
    if (!eventHandlers.has(event)) {
      eventHandlers.set(event, new Set())
    }
    eventHandlers.get(event)!.add(handler)
  }

  function off(event: string, handler: (...args: unknown[]) => void) {
    const handlers = eventHandlers.get(event)
    if (handlers) {
      handlers.delete(handler)
    }
  }

  return {
    emit,
    on,
    off
  }
}
