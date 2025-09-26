import { createAvatar } from '@dicebear/core'
import { identicon } from '@dicebear/collection'

export function useDiceBearAvatar(seed: string) {
  const avatarDataUri = computed(() => {
    if (!seed) return ''

    const avatar = createAvatar(identicon, {
      seed: seed.toLowerCase(),
      size: 128
    })

    return avatar.toDataUri()
  })

  return avatarDataUri
}
